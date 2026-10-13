# 📁 FILE: D:\EquationTool\test.py
# 📌 WHAT: Equation Studio window: pin, page-aware capture (segments), PDF export/print, exe-safe paths, logging

import ctypes
import json
import logging
import os
import sys
from datetime import datetime

import win32clipboard
from PySide6.QtCore import QBuffer, QIODevice, QMarginsF, Qt, QTimer, QUrl
from PySide6.QtGui import QColor, QIcon, QImage, QPageLayout, QPageSize, QPainter
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QFileDialog, QVBoxLayout, QWidget

APP_NAME = "EquationStudio"
APP_ID = "FarooqBuilds.EquationStudio"
FROZEN = getattr(sys, "frozen", False)

# Read-only bundled files (html, js, fonts, icon).
# Dev mode: this folder. Exe mode: PyInstaller's _internal folder.
RES_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def resolve_data_dir():
    """Writable folder for web_storage, captures and logs.
    Exe mode: folder next to the exe (portable). Falls back to %LOCALAPPDATA% if not writable."""
    if FROZEN:
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    try:
        os.makedirs(base, exist_ok=True)
        probe = os.path.join(base, ".write_test")
        with open(probe, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(probe)
        return base
    except OSError:
        fallback = os.path.join(
            os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), APP_NAME
        )
        os.makedirs(fallback, exist_ok=True)
        return fallback


DATA_DIR = resolve_data_dir()
CAPTURE_DIR = os.path.join(DATA_DIR, "captures")
STORAGE_DIR = os.path.join(DATA_DIR, "web_storage")
LOG_PATH = os.path.join(DATA_DIR, "equation_studio.log")
HTML_PATH = os.path.join(RES_DIR, "word_style_editor.html")
ICON_PATH = os.path.join(RES_DIR, "icon.ico")

POLL_INTERVAL_MS = 300
SCROLL_SETTLE_MS = 180  # wait after scrolling so the page repaints
CAPTURE_SETTLE_MS = 300  # wait after switching the page to capture mode
MAX_CLIPBOARD_PX = 12000  # taller than this -> split into pages
PAGE_PX = 5000  # target page height when splitting
MAX_SLICES = 300  # safety guard against endless loops (per segment)
PDF_MARGIN_MM = 19.05  # 0.75 inch, matches the 72 px page margin on screen

handlers = [logging.FileHandler(LOG_PATH, encoding="utf-8")]
if not FROZEN:
    handlers.append(logging.StreamHandler())
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=handlers,
)
log = logging.getLogger(APP_NAME)


def log_uncaught(exc_type, exc, tb):
    log.critical("Uncaught exception", exc_info=(exc_type, exc, tb))


sys.excepthook = log_uncaught


def copy_qimage_to_clipboard(qimage):
    """Copy a QImage to the Windows clipboard as a DIB (pastes into Word, Notepad, browsers)."""
    rgb = qimage.convertToFormat(QImage.Format.Format_RGB32)
    buffer = QBuffer()
    buffer.open(QIODevice.OpenModeFlag.ReadWrite)
    rgb.save(buffer, "BMP")
    data = bytes(buffer.data())[14:]  # strip the 14-byte BMP file header
    buffer.close()
    win32clipboard.OpenClipboard()
    try:
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardData(win32clipboard.CF_DIB, data)
    finally:
        win32clipboard.CloseClipboard()


def split_pages(image, breaks_px, max_px):
    """Split a tall image into pages, cutting only at paragraph boundaries when possible."""
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


def make_pdf_layout(size_name):
    size_id = QPageSize.PageSizeId.Letter if size_name == "Letter" else QPageSize.PageSizeId.A4
    return QPageLayout(
        QPageSize(size_id),
        QPageLayout.Orientation.Portrait,
        QMarginsF(PDF_MARGIN_MM, PDF_MARGIN_MM, PDF_MARGIN_MM, PDF_MARGIN_MM),
        QPageLayout.Unit.Millimeter,
    )


class EditorPage(QWebEnginePage):
    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        log.info("JS Console: %s (line %s)", message, lineNumber)


class EquationStudio(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Equation Studio")
        if os.path.exists(ICON_PATH):
            self.setWindowIcon(QIcon(ICON_PATH))
        self.resize(1100, 820)
        self.pinned = True
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, True)

        os.makedirs(STORAGE_DIR, exist_ok=True)
        self.profile = QWebEngineProfile("EquationEditorProfile", self)
        self.profile.setPersistentStoragePath(STORAGE_DIR)
        self.profile.setCachePath(os.path.join(STORAGE_DIR, "cache"))
        self.profile.setPersistentCookiesPolicy(
            QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies
        )

        self.web_view = QWebEngineView(self)
        self.page = EditorPage(self.profile, self.web_view)
        self.web_view.setPage(self.page)
        self.page.pdfPrintingFinished.connect(self.on_pdf_done)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.web_view)

        # capture state
        self.busy = False
        self.mode = "clipboard"
        self.page_no = None
        self.segments = []
        self.seg_index = 0
        self.seg_images = []
        self.breaks_src = []
        self.info = {}
        self.slices = []
        self.breaks_px = []
        self.covered = 0.0
        self.guard = 0
        self.ratio = 1.0

        # pdf state
        self.pdf_mode = "pdf"

        self.web_view.loadFinished.connect(self.on_load_finished)
        self.web_view.load(QUrl.fromLocalFile(HTML_PATH))

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.poll_triggers)
        self.timer.start(POLL_INTERVAL_MS)

    # ---------- helpers ----------
    def js(self, code, callback=None):
        if callback:
            self.page.runJavaScript(code, callback)
        else:
            self.page.runJavaScript(code)

    def toast(self, message, kind="success"):
        self.js(f"window.showToast({json.dumps(message)}, {json.dumps(kind)});")

    # ---------- pin (always on top) ----------
    def toggle_pin(self):
        self.pinned = not self.pinned
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, self.pinned)
        self.show()  # changing window flags hides the window
        self.sync_pin_state()

    def sync_pin_state(self):
        self.js(f"window.setPinned && window.setPinned({str(self.pinned).lower()});")

    def on_load_finished(self, ok):
        if ok:
            self.sync_pin_state()
        else:
            log.error("Failed to load %s", HTML_PATH)

    # ---------- polling the page for button clicks ----------
    def poll_triggers(self):
        self.js(
            "(function(){"
            "var r={req:window.pyCaptureRequest||'',pin:!!window.pyPinTrigger};"
            "window.pyCaptureRequest='';window.pyPinTrigger=false;"
            "return JSON.stringify(r);})();",
            self.handle_triggers,
        )

    def handle_triggers(self, result):
        if not result:
            return
        try:
            t = json.loads(result)
        except (TypeError, ValueError):
            return
        if t.get("pin"):
            self.toggle_pin()
        req = t.get("req") or ""
        if not req:
            return
        name, _, arg = req.partition(":")  # e.g. "clipboard:2" = copy page 2
        page = int(arg) if arg.isdigit() else None
        if name == "folder":
            self.open_captures_folder()
        elif name in ("clipboard", "save"):
            self.start_capture(name, page)
        elif name in ("pdf", "print"):
            self.export_pdf(name)

    def open_captures_folder(self):
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        os.startfile(CAPTURE_DIR)

    # ---------- capture: scroll, grab, stitch (one or more segments) ----------
    def start_capture(self, mode, page=None):
        if self.busy:
            return
        self.busy = True
        self.mode = mode
        self.page_no = page
        self.js("window.prepareForCapture && window.prepareForCapture();")
        QTimer.singleShot(CAPTURE_SETTLE_MS, self.read_info)  # let the page re-layout

    def read_info(self):
        arg = "null" if self.page_no is None else str(int(self.page_no))
        self.js(
            f"window.getCaptureInfo && window.getCaptureInfo({arg});", self.begin_stitch
        )

    def begin_stitch(self, result):
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

    def next_segment(self):
        if self.seg_index >= len(self.segments):
            return self.join_segments()
        self.info = self.segments[self.seg_index]
        self.slices, self.covered, self.guard = [], 0.0, 0
        self.scroll_next()

    def scroll_next(self):
        target = int(self.info["y"] + self.covered)
        self.js(f"window.scrollTo(0,{target});")
        QTimer.singleShot(
            SCROLL_SETTLE_MS, lambda: self.js("window.scrollY;", self.grab_slice)
        )

    def grab_slice(self, scroll_y):
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
        except Exception as e:
            self.fail(str(e))

    def finish_segment(self):
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
        except Exception as e:
            self.fail(str(e))

    def join_segments(self):
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
        except Exception as e:
            self.fail(str(e))

    # ---------- deliver the finished image ----------
    def deliver(self, image):
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        tag = f"_p{self.page_no}" if self.page_no else ""

        if image.height() > MAX_CLIPBOARD_PX:
            pages = split_pages(image, self.breaks_px, PAGE_PX)
            for i, page_img in enumerate(pages, 1):
                page_img.save(
                    os.path.join(CAPTURE_DIR, f"equation_{stamp}_page{i}.png"), "PNG"
                )
            self.toast(f"Long document: saved {len(pages)} pages in Captures", "warn")
            self.open_captures_folder()
            return self.finish()

        default_path = os.path.join(CAPTURE_DIR, f"equation_{stamp}{tag}.png")
        label = f"Page {self.page_no}" if self.page_no else "Image"
        if self.mode == "save":
            target, _ = QFileDialog.getSaveFileName(
                self, "Save image", default_path, "PNG image (*.png)"
            )
            if target:
                image.save(target, "PNG")
                self.toast(f"Saved: {os.path.basename(target)}")
            else:
                self.toast("Save cancelled", "warn")
        else:
            image.save(default_path, "PNG")  # backend copy
            copy_qimage_to_clipboard(image)
            self.toast(f"{label} copied to clipboard (also saved in Captures)")
        self.finish()

    def fail(self, reason):
        log.error("Capture error: %s", reason)
        self.toast("Error: capture failed", "error")
        self.finish()

    def finish(self):
        self.js("window.restoreAfterCapture && window.restoreAfterCapture();")
        self.js("window.scrollTo(0,0);")
        self.busy = False

    # ---------- PDF: save / print ----------
    def export_pdf(self, mode):
        if self.busy:
            return
        self.pdf_mode = mode
        self.js("window.getPageSize ? window.getPageSize() : 'A4';", self.pdf_with_size)

    def pdf_with_size(self, size_name):
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if self.pdf_mode == "pdf":
            default_path = os.path.join(CAPTURE_DIR, f"equation_{stamp}.pdf")
            target, _ = QFileDialog.getSaveFileName(
                self, "Save PDF", default_path, "PDF document (*.pdf)"
            )
            if not target:
                return self.toast("Save cancelled", "warn")
        else:
            target = os.path.join(CAPTURE_DIR, f"print_{stamp}.pdf")
        self.page.printToPdf(target, make_pdf_layout(size_name or "A4"))

    def on_pdf_done(self, path, ok):
        if not ok:
            log.error("PDF export failed: %s", path)
            return self.toast("Error: PDF export failed", "error")
        if self.pdf_mode == "print":
            os.startfile(path)
            self.toast("PDF opened. Press Ctrl+P there to print", "warn")
        else:
            self.toast(f"Saved: {os.path.basename(path)}")

    # ---------- clean shutdown (removes the 'Release of profile' warning) ----------
    def closeEvent(self, event):
        self.timer.stop()
        try:
            self.web_view.setPage(None)
        except Exception:
            pass
        self.page.deleteLater()
        super().closeEvent(event)


if __name__ == "__main__":
    try:  # separate taskbar identity so our icon shows (not python's)
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
    except Exception:
        pass
    app = QApplication(sys.argv)
    window = EquationStudio()
    window.show()
    sys.exit(app.exec())