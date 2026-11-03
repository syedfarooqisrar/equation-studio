# 📁 FILE: D:\EquationTool\export_service.py
"""Save As in many formats: the editor sends clean HTML, Pandoc converts it (offline, runs in the background)."""
from __future__ import annotations

import logging
import os
import re
import shutil
import tempfile

from PySide6.QtCore import QObject, QProcess, QTimer
from PySide6.QtWidgets import QFileDialog

log = logging.getLogger("EquationStudio.export")

MAX_HTML_CHARS = 40_000_000     # bigger documents are refused (pictures are embedded in the HTML)
CONVERT_TIMEOUT_MS = 120_000    # a conversion that takes longer is stopped
CREATE_NO_WINDOW = 0x08000000   # Windows: no black console window flashes up

# key -> (save dialog filter, file extension, Pandoc writer arguments)
FORMATS: dict[str, tuple[str, str, list[str]]] = {
    "docx": ("Word document (*.docx)", "docx", ["-t", "docx"]),
    "odt": ("OpenDocument text (*.odt)", "odt", ["-t", "odt"]),
    "rtf": ("Rich Text Format (*.rtf)", "rtf", ["-t", "rtf", "-s"]),
    "epub": ("E-book (*.epub)", "epub", ["-t", "epub3"]),
    "md": ("Markdown (*.md)", "md", ["-t", "markdown", "--wrap=none"]),
    "txt": ("Plain text (*.txt)", "txt", ["-t", "plain", "--wrap=none"]),
    "tex": ("LaTeX (*.tex)", "tex", ["-t", "latex", "-s", "--wrap=none"]),
    "html": ("Web page (*.html)", "html", ["-t", "html5", "-s", "--mathml"]),
}


def _no_window(args) -> None:
    try:
        args.flags |= CREATE_NO_WINDOW
    except Exception:  # noqa: BLE001
        pass


class ExportService(QObject):
    def __init__(self, data_dir: str, res_dir: str, toast, parent=None) -> None:
        super().__init__(parent)
        self.data_dir = data_dir
        self.res_dir = res_dir
        self.toast = toast
        self.proc: QProcess | None = None
        self.tmp: str | None = None
        self.target = ""
        self.timed_out = False
        self.timeout = QTimer(self)
        self.timeout.setSingleShot(True)
        self.timeout.timeout.connect(self.on_timeout)

    # ---------- where is Pandoc? ----------
    def pandoc_path(self) -> str | None:
        for base in (self.data_dir, self.res_dir):
            for sub in (("tools", "pandoc"), ("pandoc",)):
                p = os.path.join(base, *sub, "pandoc.exe")
                if os.path.isfile(p):
                    return p
        return shutil.which("pandoc")

    # ---------- request from the page ----------
    def handle(self, req: dict, parent) -> None:
        if self.proc is not None:
            return self.toast("Another save is still running. Please wait.", "warn")

        fmt = req.get("fmt")
        html = req.get("html")
        if fmt not in FORMATS or not isinstance(html, str) or not html.strip():
            log.warning("Export request ignored (format=%r)", fmt)
            return self.toast("Error: nothing to save", "error")
        if len(html) > MAX_HTML_CHARS:
            return self.toast("Error: the document is too large to save in this format", "error")

        title = req.get("title")
        title = title.strip()[:120] if isinstance(title, str) else ""
        title = title or "Equation Studio document"

        exe = self.pandoc_path()
        if not exe:
            return self.toast("Pandoc is missing. Run: powershell -ExecutionPolicy Bypass -File tools\\download_pandoc.ps1", "error")

        flt, ext, writer_args = FORMATS[fmt]
        safe = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", title).strip(" .") or "document"
        start = os.path.join(os.path.expanduser("~"), "Documents", f"{safe}.{ext}")
        target, _ = QFileDialog.getSaveFileName(parent, "Save as", start, flt)
        if not target:
            return self.toast("Save cancelled", "warn")
        if not target.lower().endswith("." + ext):
            target += "." + ext

        try:
            self.tmp = tempfile.mkdtemp(prefix="eqexport_")
            src = os.path.join(self.tmp, "input.html")
            with open(src, "w", encoding="utf-8") as f:
                f.write(html)
        except OSError:
            log.exception("could not write the temporary file")
            self._cleanup()
            return self.toast("Error: could not prepare the file (disk full?)", "error")

        meta = ["-M", ("title=" if fmt == "epub" else "pagetitle=") + title]
        if fmt == "epub":
            meta += ["-M", "lang=en"]

        self.target = target
        self.timed_out = False
        proc = QProcess(self)
        proc.setProgram(exe)
        proc.setArguments(["-f", "html", *writer_args, *meta, "-o", target, src])
        proc.setWorkingDirectory(self.tmp)
        try:
            proc.setCreateProcessArgumentsModifier(_no_window)
        except Exception:  # noqa: BLE001
            pass
        proc.finished.connect(self.on_finished)
        proc.errorOccurred.connect(self.on_error)
        self.proc = proc
        self.toast("Saving…", "warn")
        self.timeout.start(CONVERT_TIMEOUT_MS)
        proc.start()

    # ---------- results ----------
    def on_finished(self, code: int, status) -> None:
        proc = self.proc
        if proc is None:
            return
        err = bytes(proc.readAllStandardError()).decode("utf-8", "replace").strip()
        ok = code == 0 and status == QProcess.ExitStatus.NormalExit and os.path.isfile(self.target)
        target, timed_out = self.target, self.timed_out
        self._cleanup()
        if ok:
            return self.toast("Saved: " + os.path.basename(target))
        log.error("Pandoc failed (code %s): %s", code, err[:500])
        if timed_out:
            return self.toast("Error: saving took too long and was stopped", "error")
        first = err.splitlines()[0][:110] if err else "unknown problem"
        self.toast(f"Error: could not save. {first} (If the file is open in Word, close it and try again.)", "error")

    def on_error(self, error) -> None:
        if error == QProcess.ProcessError.FailedToStart and self.proc is not None:
            log.error("Pandoc could not start")
            self._cleanup()
            self.toast("Error: Pandoc could not start. Run tools\\download_pandoc.ps1 again.", "error")

    def on_timeout(self) -> None:
        if self.proc is not None:
            self.timed_out = True
            self.proc.kill()

    def _cleanup(self) -> None:
        self.timeout.stop()
        if self.proc is not None:
            self.proc.deleteLater()
            self.proc = None
        if self.tmp:
            shutil.rmtree(self.tmp, ignore_errors=True)
            self.tmp = None

    def shutdown(self) -> None:
        try:
            if self.proc is not None and self.proc.state() != QProcess.ProcessState.NotRunning:
                self.proc.kill()
                self.proc.waitForFinished(1000)
        except Exception:  # noqa: BLE001
            pass
        self._cleanup()