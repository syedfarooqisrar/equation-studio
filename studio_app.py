# 📁 FILE: D:\EquationTool\main.py
"""Equation Studio: desktop shell (PySide6 + QtWebEngine).

Loads word_style_editor.html, takes page-aware screenshots, exports PDF and keeps the app safe:
single instance, navigation locked to the local page, crash recovery, rotating logs.
"""
from __future__ import annotations

import ctypes
import faulthandler
import json
import logging
import os
import sys
import time
from datetime import datetime
from logging.handlers import RotatingFileHandler

from PySide6.QtCore import QBuffer, QIODevice, QLockFile, QMarginsF, QSettings, Qt, QTimer, QUrl
from PySide6.QtGui import QColor, QIcon, QImage, QPageLayout, QPageSize, QPainter
from PySide6.QtWebEngineCore import QWebEngineDownloadRequest, QWebEnginePage, QWebEngineProfile, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QFileDialog, QMessageBox, QVBoxLayout, QWidget
import multiprocessing as mp

from solver_engine import worker_main  # light module: SymPy is only imported inside the worker process
from tex_service import TexService

try:
    import win32clipboard  # best compatibility with Word, Paint, browsers
except ImportError:  # falls back to Qt's clipboard
    win32clipboard = None

APP_NAME = "EquationStudio"
APP_TITLE = "Equation Studio"
APP_VERSION = "1.2.0"
APP_ID = "FarooqBuilds.EquationStudio"
FROZEN = getattr(sys, "frozen", False)

# Read-only bundled files (html, assets, fonts, icon): the script folder, or PyInstaller's _internal folder.
RES_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def resolve_data_dir() -> str:
    """Writable folder for web_storage, captures, settings and logs.
    Exe: next to the exe (portable). Falls back to %LOCALAPPDATA% when that folder is read-only."""
    base = os.path.dirname(sys.executable) if FROZEN else os.path.dirname(os.path.abspath(__file__))
    try:
        os.makedirs(base, exist_ok=True)
        probe = os.path.join(base, ".write_test")
        with open(probe, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(probe)
        return base
    except OSError:
        fallback = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), APP_NAME)
        os.makedirs(fallback, exist_ok=True)
        return fallback


DATA_DIR = resolve_data_dir()
CAPTURE_DIR = os.path.join(DATA_DIR, "captures")
STORAGE_DIR = os.path.join(DATA_DIR, "web_storage")
LOG_PATH = os.path.join(DATA_DIR, "equation_studio.log")
CRASH_PATH = os.path.join(DATA_DIR, "crash.log")
SETTINGS_PATH = os.path.join(DATA_DIR, "settings.ini")
LOCK_PATH = os.path.join(DATA_DIR, "equation_studio.lock")
HTML_PATH = os.path.join(RES_DIR, "word_style_editor.html")
ICON_PATH = os.path.join(RES_DIR, "icon.ico")

POLL_INTERVAL_MS = 300
SCROLL_SETTLE_MS = 180        # wait after scrolling so the page repaints
CAPTURE_SETTLE_MS = 300       # wait after switching the page to capture mode
CAPTURE_TIMEOUT_MS = 30000    # a capture that takes longer is abandoned
MAX_CLIPBOARD_PX = 12000      # taller than this -> split into pages
PAGE_PX = 5000                # target page height when splitting
MAX_SLICES = 300              # safety guard against endless loops (per segment)
PDF_MARGIN_MM = 19.05         # 0.75 inch, matches the 72 px page margin on screen
MAX_RENDER_CRASHES = 3        # reloads allowed per minute before giving up
ALLOWED_REQUESTS = {"clipboard", "save", "folder", "pdf", "print", "selection"}
SOLVE_TIMEOUT_S = 40          # a solve that takes longer is cancelled
MAX_SOLVE_LATEX = 2000

# ---------------------------------------------------------------- logging
_handlers: list[logging.Handler] = [
    RotatingFileHandler(LOG_PATH, maxBytes=512 * 1024, backupCount=2, encoding="utf-8")
]
if not FROZEN:
    _handlers.append(logging.StreamHandler())
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=_handlers)
log = logging.getLogger(APP_NAME)


def _log_uncaught(exc_type, exc, tb) -> None:
    log.critical("Uncaught exception", exc_info=(exc_type, exc, tb))


sys.excepthook = _log_uncaught
try:  # native crashes (segfaults) leave a trace in crash.log
    _crash_file = open(CRASH_PATH, "a", encoding="utf-8")
    faulthandler.enable(_crash_file)
except Exception:  # pragma: no cover
    pass


# ---------------------------------------------------------------- helpers
def copy_qimage_to_clipboard(qimage: QImage) -> None:
    """Put an image on the clipboard (DIB for classic apps). Retries when another app holds the clipboard."""
    if win32clipboard is not None:
        rgb = qimage.convertToFormat(QImage.Format.Format_RGB32)
        buffer = QBuffer()
        buffer.open(QIODevice.OpenModeFlag.ReadWrite)
        rgb.save(buffer, "BMP")
        data = bytes(buffer.data())[14:]  # strip the 14-byte BMP file header
        buffer.close()
        for _ in range(6):
            try:
                win32clipboard.OpenClipboard()
                try:
                    win32clipboard.EmptyClipboard()
                    win32clipboard.SetClipboardData(win32clipboard.CF_DIB, data)
                finally:
                    win32clipboard.CloseClipboard()
                return
            except Exception:
                time.sleep(0.05)
        log.warning("pywin32 clipboard was busy, using the Qt clipboard")
    QApplication.clipboard().setImage(qimage)


def split_pages(image: QImage, breaks_px: list[int], max_px: int) -> list[QImage]:
    """Split a tall image into pages, cutting at block boundaries when possible."""
    pages, start, total = [], 0, image.height()
    while start < total:
        limit = start + max_px
        if limit >= total:
            end = total
        else:
            candidates = [b for b in breaks_px if start + max_px * 0.5 < b <= limit]
            end = max(candidates) if candidates else limit
        pages.append(image.copy(0, start, image.width(), end - start))
        start = end
    return pages


def make_pdf_layout(size_name: str, margin_mm: float = PDF_MARGIN_MM) -> QPageLayout:
    size_id = QPageSize.PageSizeId.Letter if size_name == "Letter" else QPageSize.PageSizeId.A4
    return QPageLayout(
        QPageSize(size_id),
        QPageLayout.Orientation.Portrait,
        QMarginsF(margin_mm, margin_mm, margin_mm, margin_mm),
        QPageLayout.Unit.Millimeter,
    )


def harden(settings: QWebEngineSettings) -> None:
    """Switch off web features this offline app never needs (attributes missing in a Qt version are skipped)."""
    for name, value in (
        ("JavascriptCanOpenWindows", False),
        ("LocalContentCanAccessRemoteUrls", False),
        ("AllowRunningInsecureContent", False),
        ("PluginsEnabled", False),
        ("PdfViewerEnabled", False),
        ("ScreenCaptureEnabled", False),
        ("WebRTCPublicInterfacesOnly", True),
        ("JavascriptCanAccessClipboard", True),
        ("JavascriptCanPaste", True),
    ):
        attr = getattr(QWebEngineSettings.WebAttribute, name, None)
        if attr is not None:
            settings.setAttribute(attr, value)


class SolverClient:
    """Runs the SymPy solver in a separate process: a hard problem can never freeze or crash the editor."""

    def __init__(self, on_result) -> None:
        self.on_result = on_result
        self.proc = None
        self.conn = None
        self.current: dict | None = None
        self.pending: dict | None = None
        self.started = 0.0

    def _start(self) -> None:
        self._stop()
        parent, child = mp.Pipe()
        self.proc = mp.Process(target=worker_main, args=(child,), daemon=True)
        self.proc.start()
        child.close()
        self.conn = parent

    def _stop(self) -> None:
        try:
            if self.conn is not None:
                self.conn.close()
        except Exception:  # noqa: BLE001
            pass
        try:
            if self.proc is not None and self.proc.is_alive():
                self.proc.terminate()
                self.proc.join(1)
        except Exception:  # noqa: BLE001
            pass
        self.proc = None
        self.conn = None

    def submit(self, req: dict) -> None:
        if self.current is not None:
            self.pending = req  # only the newest waiting request matters
            return
        self._send(req)

    def _send(self, req: dict) -> None:
        try:
            if self.proc is None or self.conn is None or not self.proc.is_alive():
                self._start()
            self.conn.send(req)
            self.current = req
            self.started = time.monotonic()
        except Exception:  # noqa: BLE001
            log.exception("solver could not start")
            self.current = None
            self._stop()
            self.on_result({"id": req.get("id"), "ok": False, "error": "The solver could not start.",
                            "hint": "Install it with: pip install sympy"})

    def _finish(self, result: dict) -> None:
        self.current = None
        self.on_result(result)
        if self.pending is not None:
            nxt, self.pending = self.pending, None
            self._send(nxt)

    def poll(self) -> None:
        if self.current is None:
            return
        rid = self.current.get("id")
        crashed = {"id": rid, "ok": False, "error": "The solver stopped unexpectedly.", "hint": "Try again."}
        try:
            if self.conn is not None and self.conn.poll(0):
                self._finish(self.conn.recv())
                return
        except (EOFError, OSError):
            self._stop()
            self._finish(crashed)
            return
        if self.proc is not None and not self.proc.is_alive():
            self._stop()
            self._finish(crashed)
        elif time.monotonic() - self.started > SOLVE_TIMEOUT_S:
            log.warning("Solve timed out")
            self._stop()
            self._finish({"id": rid, "ok": False, "error": "This one takes too long to solve.",
                          "hint": "Try a simpler form of the problem."})

    def shutdown(self) -> None:
        self._stop()


class EditorPage(QWebEnginePage):
    """Only the bundled editor page may be shown; links, pop-ups and dropped files are blocked."""

    def __init__(self, profile: QWebEngineProfile, parent, allowed_path: str):
        super().__init__(profile, parent)
        self._allowed = os.path.normcase(os.path.abspath(allowed_path))

    def javaScriptConsoleMessage(self, level, message, line, source):  # noqa: N802 (Qt name)
        log.info("JS Console: %s (line %s)", message, line)

    def acceptNavigationRequest(self, url, nav_type, is_main_frame):  # noqa: N802
        if url.isLocalFile() and os.path.normcase(os.path.abspath(url.toLocalFile())) == self._allowed:
            return True
        log.warning("Blocked navigation to %s", url.toString()[:200])
        return False

    def createWindow(self, window_type):  # noqa: N802
        log.warning("Blocked pop-up window")
        return None


class EquationStudio(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle(APP_TITLE)
        if os.path.exists(ICON_PATH):
            self.setWindowIcon(QIcon(ICON_PATH))
        self.settings = QSettings(SETTINGS_PATH, QSettings.Format.IniFormat)
        self.place_window()

        os.makedirs(STORAGE_DIR, exist_ok=True)
        self.profile = QWebEngineProfile("EquationEditorProfile", self)
        self.profile.setPersistentStoragePath(STORAGE_DIR)
        self.profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.NoPersistentCookies)
        try:  # nothing is downloaded, so the cache only needs memory
            self.profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.MemoryHttpCache)
        except Exception:
            pass

        self.web_view = QWebEngineView(self)
        self.page = EditorPage(self.profile, self.web_view, HTML_PATH)
        self.web_view.setPage(self.page)
        harden(self.page.settings())
        self.page.pdfPrintingFinished.connect(self.on_pdf_done)
        self.profile.downloadRequested.connect(self.on_download)
        self.page.renderProcessTerminated.connect(self.on_render_terminated)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.web_view)

        # capture state
        self.busy = False
        self.mode = "clipboard"
        self.page_no: int | None = None
        self.segments: list[dict] = []
        self.seg_index = 0
        self.seg_images: list[QImage] = []
        self.breaks_src: list[float] = []
        self.info: dict = {}
        self.slices: list[QImage] = []
        self.breaks_px: list[int] = []
        self.covered = 0.0
        self.guard = 0
        self.ratio = 1.0
        self.watchdog = QTimer(self)
        self.watchdog.setSingleShot(True)
        self.watchdog.timeout.connect(lambda: self.fail("capture timed out"))

        # pdf state
        self.pdf_mode = "pdf"
        self.pdf_pending = False

        # renderer crash recovery
        self.crash_times: list[float] = []

        self.web_view.loadFinished.connect(self.on_load_finished)
        self.web_view.load(QUrl.fromLocalFile(HTML_PATH))

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.poll_triggers)
        self.timer.start(POLL_INTERVAL_MS)

        self.solver = SolverClient(self.on_solve_result)
        self.solver_timer = QTimer(self)
        self.solver_timer.timeout.connect(self.solver.poll)
        self.solver_timer.start(120)
        self.tex = TexService(DATA_DIR, RES_DIR, self.send_tex, self.toast, self)

    # ---------- window size / position ----------
    def place_window(self) -> None:
        """Open at a size that fits the usable screen (taskbar excluded); remember the last size/position."""
        avail = QApplication.primaryScreen().availableGeometry()
        self.setMinimumSize(min(720, avail.width()), min(520, max(300, avail.height() - 80)))

        saved = self.settings.value("geometry")
        if saved is not None and self.restoreGeometry(saved):
            g = self.geometry()
            if g.width() <= avail.width() and g.height() <= avail.height() and avail.intersects(g):
                return
            self.setWindowState(Qt.WindowState.WindowNoState)  # unusable saved state -> default

        w = min(1100, int(avail.width() * 0.9))
        h = min(820, int(avail.height() * 0.86))
        self.resize(w, h)
        self.move(avail.x() + (avail.width() - w) // 2, avail.y() + max(0, (avail.height() - h) // 2 - 12))

    # ---------- helpers ----------
    def js(self, code: str, callback=None) -> None:
        if callback:
            self.page.runJavaScript(code, callback)
        else:
            self.page.runJavaScript(code)

    def toast(self, message: str, kind: str = "success") -> None:
        self.js(f"window.showToast && window.showToast({json.dumps(message)}, {json.dumps(kind)});")

    def on_load_finished(self, ok: bool) -> None:
        if not ok:
            log.error("Failed to load %s", HTML_PATH)

    def on_render_terminated(self, status, exit_code) -> None:
        """The web process died: reload the page (the document is restored from autosave)."""
        log.error("Render process terminated: %s (code %s)", status, exit_code)
        self.busy = False
        self.pdf_pending = False
        now = time.monotonic()
        self.crash_times = [t for t in self.crash_times if now - t < 60] + [now]
        if len(self.crash_times) > MAX_RENDER_CRASHES:
            QMessageBox.critical(self, APP_TITLE, "The editor keeps crashing. Please restart Equation Studio.\nYour document is saved automatically.")
            return
        QTimer.singleShot(500, self.web_view.reload)

    # ---------- polling the page for button clicks ----------
    def poll_triggers(self) -> None:
        self.js(
            "(function(){var r=window.pyCaptureRequest||'',s=window.pySolveRequest||'',t=window.pyTexRequest||'';"
            "window.pyCaptureRequest='';window.pySolveRequest='';window.pyTexRequest='';return JSON.stringify({r:r,s:s,t:t});})();",
            self.handle_poll,
        )

    def handle_poll(self, result) -> None:
        try:
            data = json.loads(result) if isinstance(result, str) else {}
        except ValueError:
            return
        if data.get("s"):
            self.handle_solve(data["s"])
        if data.get("t"):
            self.handle_tex(data["t"])
        self.handle_request(data.get("r", ""))

    def handle_solve(self, raw) -> None:
        try:
            req = json.loads(raw)
            rid = int(req["id"])
            latex = str(req["latex"])
            var = req.get("var")
            var = var if isinstance(var, str) and var.isalnum() and len(var) <= 12 else None
        except (ValueError, KeyError, TypeError):
            return
        if len(latex) > MAX_SOLVE_LATEX:
            return self.on_solve_result({"id": rid, "ok": False, "error": "The equation is too long."})
        self.solver.submit({"id": rid, "latex": latex, "var": var})

    def handle_tex(self, raw) -> None:
        try:
            req = json.loads(raw)
        except ValueError:
            return
        if isinstance(req, dict):
            self.tex.handle(req, self)

    def send_tex(self, res: dict) -> None:
        try:
            self.js("window.onTexResult && window.onTexResult(" + json.dumps(res) + ");")
        except (TypeError, ValueError):
            log.exception("could not send the LaTeX result to the page")

    def on_solve_result(self, res: dict) -> None:
        try:
            self.js("window.onSolveResult && window.onSolveResult(" + json.dumps(res) + ");")
        except (TypeError, ValueError):
            log.exception("could not send the solution to the page")

    def handle_request(self, result) -> None:
        req = result if isinstance(result, str) else ""
        if not req:
            return
        name, _, arg = req.partition(":")  # e.g. "clipboard:2" = copy page 2
        if len(req) > 32 or name not in ALLOWED_REQUESTS:
            log.warning("Ignored unknown request: %r", req[:40])
            return
        page = int(arg) if arg.isdigit() and 1 <= int(arg) <= 999 else None
        if name == "folder":
            self.open_captures_folder()
        elif name in ("clipboard", "save", "selection"):
            self.start_capture(name, page)
        else:
            self.export_pdf(name)

    def open_captures_folder(self) -> None:
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        self.open_path(CAPTURE_DIR)

    def open_path(self, path: str) -> None:
        try:
            os.startfile(path)  # type: ignore[attr-defined]  (Windows only)
        except OSError as e:
            log.error("Could not open %s: %s", path, e)
            self.toast("Could not open it. No app is set for this file type.", "error")

    # ---------- capture: scroll, grab, stitch (one or more segments) ----------
    def start_capture(self, mode: str, page: int | None = None) -> None:
        if self.busy:
            return
        self.busy = True
        self.mode = mode
        self.page_no = page
        self.watchdog.start(CAPTURE_TIMEOUT_MS)
        self.js("window.prepareForCapture && window.prepareForCapture();")
        QTimer.singleShot(CAPTURE_SETTLE_MS, self.read_info)

    def read_info(self) -> None:
        if self.mode == "selection":
            arg = '"sel"'
        else:
            arg = "null" if self.page_no is None else str(int(self.page_no))
        self.js(f"window.getCaptureInfo && window.getCaptureInfo({arg});", self.begin_stitch)

    def begin_stitch(self, result) -> None:
        try:
            data = json.loads(result)
        except (TypeError, ValueError):
            return self.fail("could not read the document")
        self.segments = data.get("segments") or []
        self.breaks_src = data.get("breaks") or []
        if not self.segments:
            return self.fail("nothing to capture")
        self.seg_images = []
        self.seg_index = 0
        self.next_segment()

    def next_segment(self) -> None:
        if self.seg_index >= len(self.segments):
            return self.join_segments()
        self.info = self.segments[self.seg_index]
        self.slices, self.covered, self.guard = [], 0.0, 0
        self.scroll_next()

    def scroll_next(self) -> None:
        target = int(self.info["y"] + self.covered)
        self.js(f"window.scrollTo(0,{target});")
        QTimer.singleShot(SCROLL_SETTLE_MS, lambda: self.js("window.scrollY;", self.grab_slice))

    def grab_slice(self, scroll_y) -> None:
        if not self.busy:  # abandoned (timeout / crash)
            return
        try:
            pixmap = self.web_view.grab()
            ratio = pixmap.devicePixelRatio()
            self.ratio = ratio
            view_h = pixmap.height() / ratio
            view_y = self.info["y"] + self.covered - float(scroll_y)
            remaining = self.info["h"] - self.covered
            taken = min(view_h - view_y, remaining)
            self.guard += 1
            if taken <= 0.5 or self.guard > MAX_SLICES:
                raise RuntimeError("capture did not advance")

            x_px = max(0, round(self.info["x"] * ratio))
            w_px = round(self.info["w"] * ratio)
            y_px = round(view_y * ratio)
            h_px = max(1, round(taken * ratio))
            self.slices.append(pixmap.copy(x_px, y_px, w_px, h_px).toImage())
            self.covered += taken

            if self.covered >= self.info["h"] - 0.5:
                self.finish_segment()
            else:
                self.scroll_next()
        except Exception as e:  # noqa: BLE001
            self.fail(str(e))

    def finish_segment(self) -> None:
        try:
            total_h = sum(s.height() for s in self.slices)
            image = QImage(self.slices[0].width(), total_h, QImage.Format.Format_RGB32)
            image.fill(QColor("white"))
            painter = QPainter(image)
            y = 0
            for s in self.slices:
                painter.drawImage(0, y, s)
                y += s.height()
            painter.end()
            self.seg_images.append(image)
            self.seg_index += 1
            self.next_segment()
        except Exception as e:  # noqa: BLE001
            self.fail(str(e))

    def join_segments(self) -> None:
        try:
            if len(self.seg_images) == 1:
                image = self.seg_images[0]
                self.breaks_px = [round(b * self.ratio) for b in self.breaks_src]
            else:
                width = max(i.width() for i in self.seg_images)
                height = sum(i.height() for i in self.seg_images)
                image = QImage(width, height, QImage.Format.Format_RGB32)
                image.fill(QColor("white"))
                painter = QPainter(image)
                y, breaks = 0, []
                for img in self.seg_images:
                    painter.drawImage(0, y, img)
                    y += img.height()
                    breaks.append(y)  # every page boundary is a safe cut
                painter.end()
                self.breaks_px = breaks
            self.deliver(image)
        except Exception as e:  # noqa: BLE001
            self.fail(str(e))

    # ---------- deliver the finished image ----------
    def deliver(self, image: QImage) -> None:
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        tag = f"_p{self.page_no}" if self.page_no else ""

        if image.height() > MAX_CLIPBOARD_PX:
            pages = split_pages(image, self.breaks_px, PAGE_PX)
            saved = 0
            for i, page_img in enumerate(pages, 1):
                if page_img.save(os.path.join(CAPTURE_DIR, f"equation_{stamp}_page{i}.png"), "PNG"):
                    saved += 1
            if saved == len(pages):
                self.toast(f"Long document: saved {saved} pages in Captures", "warn")
                self.open_captures_folder()
            else:
                self.toast("Error: could not save all pages (disk full?)", "error")
            return self.finish()

        default_path = os.path.join(CAPTURE_DIR, f"equation_{stamp}{tag}.png")
        label = "Selection" if self.mode == "selection" else (f"Page {self.page_no}" if self.page_no else "Image")
        if self.mode == "save":
            target, _ = QFileDialog.getSaveFileName(self, "Save image", default_path, "PNG image (*.png)")
            if not target:
                self.toast("Save cancelled", "warn")
            elif image.save(target, "PNG"):
                self.toast(f"Saved: {os.path.basename(target)}")
            else:
                self.toast("Error: could not save the file", "error")
        else:
            if self.mode != "selection":
                image.save(default_path, "PNG")  # backup copy in Captures
            copy_qimage_to_clipboard(image)
            if self.mode == "selection":
                self.toast("Picture copied. Paste it in Word with Ctrl+V.")
            else:
                self.toast(f"{label} copied to clipboard (also saved in Captures)")
        self.finish()

    def fail(self, reason: str) -> None:
        log.error("Capture error: %s", reason)
        self.toast("Error: capture failed", "error")
        self.finish()

    def finish(self) -> None:
        self.watchdog.stop()
        self.js("window.restoreAfterCapture && window.restoreAfterCapture();")
        self.js("window.scrollTo(0,0);")
        self.busy = False

    # ---------- PDF: save / print ----------
    def export_pdf(self, mode: str) -> None:
        if self.busy or self.pdf_pending:
            return
        self.pdf_mode = mode
        self.js("window.getPageSize ? window.getPageSize() : 'A4';", self.pdf_with_size)

    def pdf_with_size(self, size_name) -> None:
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if self.pdf_mode == "pdf":
            default_path = os.path.join(CAPTURE_DIR, f"equation_{stamp}.pdf")
            target, _ = QFileDialog.getSaveFileName(self, "Save PDF", default_path, "PDF document (*.pdf)")
            if not target:
                return self.toast("Save cancelled", "warn")
        else:
            target = os.path.join(CAPTURE_DIR, f"print_{stamp}.pdf")
        self.pdf_pending = True
        size = size_name if size_name in ("A4", "Letter") else "A4"
        # the page prepares the same page breaks as the screen (and the header, footer, page numbers) first
        self.js(
            "window.preparePrint ? window.preparePrint() : false;",
            lambda mirrored, t=target, s=size: self.page.printToPdf(
                t, make_pdf_layout(s, 0.0 if mirrored is True else PDF_MARGIN_MM)
            ),
        )

    def on_pdf_done(self, path: str, ok: bool) -> None:
        self.pdf_pending = False
        self.js("window.restorePrint && window.restorePrint();")
        if not ok:
            log.error("PDF export failed: %s", path)
            return self.toast("Error: PDF export failed", "error")
        if self.pdf_mode == "print":
            self.open_path(path)
            self.toast("PDF opened. Press Ctrl+P there to print", "warn")
        else:
            self.toast(f"Saved: {os.path.basename(path)}")

    # ---------- project file (.eqproj) save ----------
    def on_download(self, download) -> None:
        name = os.path.basename(download.downloadFileName() or "")
        if not name.lower().endswith(".eqproj"):  # the only download this app ever makes
            download.cancel()
            return
        start = os.path.join(os.path.expanduser("~"), "Documents", name)
        target, _ = QFileDialog.getSaveFileName(self, "Save project", start, "Equation Studio project (*.eqproj)")
        if not target:
            download.cancel()
            return
        download.setDownloadDirectory(os.path.dirname(target))
        download.setDownloadFileName(os.path.basename(target))
        download.stateChanged.connect(lambda state, p=target: self.on_download_state(state, p))
        download.accept()

    def on_download_state(self, state, path: str) -> None:
        states = QWebEngineDownloadRequest.DownloadState
        if state == states.DownloadCompleted:
            self.toast("Project saved: " + os.path.basename(path))
        elif state == states.DownloadInterrupted:
            self.toast("Error: could not save the project", "error")

    # ---------- clean shutdown ----------
    def closeEvent(self, event) -> None:  # noqa: N802
        try:
            self.settings.setValue("geometry", self.saveGeometry())
            self.settings.sync()
        except Exception:  # noqa: BLE001
            log.exception("could not save window geometry")
        self.timer.stop()
        self.watchdog.stop()
        self.solver_timer.stop()
        self.solver.shutdown()
        self.tex.shutdown()
        try:
            self.web_view.setPage(None)
        except Exception:  # noqa: BLE001
            pass
        self.page.deleteLater()
        super().closeEvent(event)


def main() -> int:
    if FROZEN:  # a packaged app must never expose a debugging port
        os.environ.pop("QTWEBENGINE_REMOTE_DEBUGGING", None)
        os.environ.pop("QTWEBENGINE_CHROMIUM_FLAGS", None)
    try:  # own taskbar identity so our icon shows (not python's)
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

    app = QApplication(sys.argv)
    lock = QLockFile(LOCK_PATH)  # two copies would share one storage folder and corrupt it
    if not lock.tryLock(200):
        QMessageBox.information(None, APP_TITLE, "Equation Studio is already running.")
        return 0

    window = EquationStudio()
    window.show()
    code = app.exec()
    lock.unlock()
    return code


if __name__ == "__main__":
    sys.exit(main())