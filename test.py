# 📁 FILE: D:\EquationTool\test.py
# 📌 WHAT: Equation Studio window: pin toggle + full-document capture + exe-safe paths + icon + logging

import ctypes
import json
import logging
import os
import sys
from datetime import datetime

import win32clipboard
from PySide6.QtCore import QBuffer, QIODevice, Qt, QTimer, QUrl
from PySide6.QtGui import QColor, QIcon, QImage, QPainter
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
MAX_CLIPBOARD_PX = 12000  # taller than this -> split into pages
PAGE_PX = 5000  # target page height when splitting
MAX_SLICES = 300  # safety guard against endless loops

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


class EditorPage(QWebEnginePage):
    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        log.info("JS Console: %s (line %s)", message, lineNumber)


class EquationStudio(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Equation Studio")
        if os.path.exists(ICON_PATH):
            self.setWindowIcon(QIcon(ICON_PATH))
        self.resize(1000, 800)
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

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.web_view)

        # capture state
        self.busy = False
        self.mode = "clipboard"
        self.info = {}
        self.slices = []
        self.breaks_px = []
        self.covered = 0.0
        self.guard = 0

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
        req = t.get("req")
        if req == "folder":
            self.open_captures_folder()
        elif req in ("clipboard", "save"):
            self.start_capture(req)

    def open_captures_folder(self):
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        os.startfile(CAPTURE_DIR)

    # ---------- capture: scroll, grab, stitch ----------
    def start_capture(self, mode):
        if self.busy:
            return
        self.busy = True
        self.mode = mode
        self.js("window.prepareForCapture && window.prepareForCapture();")
        QTimer.singleShot(250, self.read_info)  # let the page re-layout in capture mode

    def read_info(self):
        self.js("window.getCaptureInfo && window.getCaptureInfo();", self.begin_stitch)

    def begin_stitch(self, result):
        try:
            self.info = json.loads(result)
        except (TypeError, ValueError):
            return self.fail("could not read the document")
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
            view_h = pixmap.height() / ratio
            view_y = self.info["y"] + self.covered - float(scroll_y)
            remaining = self.info["h"] - self.covered
            taken = min(view_h - view_y, remaining)
            self.guard += 1
            if taken <= 0.5 or self.guard > MAX_SLICES:
                raise RuntimeError("capture did not advance")

            x_px = round(self.info["x"] * ratio)
            w_px = round(self.info["w"] * ratio)
            y_px = round(view_y * ratio)
            h_px = max(1, round(taken * ratio))
            self.slices.append(pixmap.copy(x_px, y_px, w_px, h_px).toImage())
            self.covered += taken

            if self.covered >= self.info["h"] - 0.5:
                self.stitch(ratio)
            else:
                self.scroll_next()
        except Exception as e:
            self.fail(str(e))

    def stitch(self, ratio):
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
            self.breaks_px = [round(b * ratio) for b in self.info.get("breaks", [])]
            self.deliver(image)
        except Exception as e:
            self.fail(str(e))

    # ---------- deliver the finished image ----------
    def deliver(self, image):
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if image.height() > MAX_CLIPBOARD_PX:
            pages = split_pages(image, self.breaks_px, PAGE_PX)
            for i, page_img in enumerate(pages, 1):
                page_img.save(
                    os.path.join(CAPTURE_DIR, f"equation_{stamp}_page{i}.png"), "PNG"
                )
            self.toast(f"Long document: saved {len(pages)} pages in Captures", "warn")
            self.open_captures_folder()
            return self.finish()

        default_path = os.path.join(CAPTURE_DIR, f"equation_{stamp}.png")
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
            self.toast("Copied to clipboard (also saved in Captures)")
        self.finish()

    def fail(self, reason):
        log.error("Capture error: %s", reason)
        self.toast("Error: capture failed", "error")
        self.finish()

    def finish(self):
        self.js("window.restoreAfterCapture && window.restoreAfterCapture();")
        self.js("window.scrollTo(0,0);")
        self.busy = False


if __name__ == "__main__":
    try:  # separate taskbar identity so our icon shows (not python's)
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
    except Exception:
        pass
    app = QApplication(sys.argv)
    window = EquationStudio()
    window.show()
    sys.exit(app.exec())