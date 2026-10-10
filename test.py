import sys
import os
import json
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PySide6.QtCore import QUrl, QTimer, QBuffer, QIODevice
import win32clipboard


def copy_qimage_to_clipboard(qimage):
    buffer = QBuffer()
    buffer.open(QIODevice.OpenModeFlag.ReadWrite)
    qimage.save(buffer, "BMP")
    data = buffer.data().data()[14:]
    buffer.close()

    win32clipboard.OpenClipboard()
    win32clipboard.EmptyClipboard()
    win32clipboard.SetClipboardData(win32clipboard.CF_DIB, data)
    win32clipboard.CloseClipboard()


class MyPage(QWebEnginePage):
    def __init__(self, profile, parent=None):
        super().__init__(profile, parent)

    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        print(f"JS Console: {message} (line {lineNumber})")

app = QApplication(sys.argv)

window = QWidget()
window.setWindowTitle("Word Style Equation Editor")
window.resize(900, 700)

from PySide6.QtCore import Qt
window.setWindowFlags(window.windowFlags() | Qt.WindowType.WindowStaysOnTopHint)

layout = QVBoxLayout()

storage_path = os.path.abspath("web_storage")
os.makedirs(storage_path, exist_ok=True)

profile = QWebEngineProfile("EquationEditorProfile")
profile.setPersistentStoragePath(storage_path)
profile.setCachePath(os.path.join(storage_path, "cache"))
profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies)

web_view = QWebEngineView()
page = MyPage(profile, web_view)
web_view.setPage(page)

html_path = os.path.abspath("word_style_editor.html")
web_view.load(QUrl.fromLocalFile(html_path))

layout.addWidget(web_view)
window.setLayout(layout)


def handle_screenshot_click():
    # Prepare the page: remove focus glow/selection so the capture is clean
    web_view.page().runJavaScript("window.prepareForCapture && window.prepareForCapture();")
    js_code = "document.getElementById('documentArea').scrollHeight;"
    QTimer.singleShot(60, lambda: web_view.page().runJavaScript(js_code, prepare_document_capture))


def prepare_document_capture(scroll_height):
    try:
        # Make sure the whole document area fits in the visible window
        needed_height = int(scroll_height) + 260
        needed_height = min(needed_height, 1400)
        if needed_height > window.height():
            window.resize(window.width(), needed_height)
        QTimer.singleShot(250, capture_document)
    except Exception as e:
        print(f"Resize error: {e}")


def capture_document():
    js_code = """
        (function() {
            const el = document.getElementById('documentArea');
            const r = el.getBoundingClientRect();
            return JSON.stringify({x: r.x, y: r.y, width: r.width, height: r.height});
        })();
    """
    web_view.page().runJavaScript(js_code, finalize_capture)


def finalize_capture(result):
    try:
        rect = json.loads(result)
        x, y, w, h = int(rect['x']), int(rect['y']), int(rect['width']), int(rect['height'])

        # Account for high-DPI screens (grab() returns device pixels)
        full_pixmap = web_view.grab()
        ratio = full_pixmap.devicePixelRatio()
        padding = 3
        cropped = full_pixmap.copy(
            int((x + padding) * ratio),
            int((y + padding) * ratio),
            int((w - padding * 2) * ratio),
            int((h - padding * 2) * ratio),
        )

        copy_qimage_to_clipboard(cropped.toImage())
        print("Document screenshot copied to clipboard!")
        web_view.page().runJavaScript("window.showToast('Copied to clipboard!');")
    except Exception as e:
        print(f"Error capturing document: {e}")
        web_view.page().runJavaScript("window.showToast('Error: could not copy');")
    finally:
        web_view.page().runJavaScript("window.restoreAfterCapture && window.restoreAfterCapture();")


def check_screenshot_trigger():
    web_view.page().runJavaScript(
        "window.pyScreenshotTrigger === true ? true : false;",
        lambda result: (handle_screenshot_click(), web_view.page().runJavaScript("window.pyScreenshotTrigger = false;")) if result else None
    )


timer = QTimer()
timer.timeout.connect(check_screenshot_trigger)
timer.start(300)

window.show()
sys.exit(app.exec())