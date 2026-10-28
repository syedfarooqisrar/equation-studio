# 📁 FILE: D:\EquationTool\tex_service.py
"""LaTeX Studio backend: compile a .tex with Tectonic or a local TeX installation, render the PDF pages to PNG
(QtPdf) and hand them to the page. The engine runs in a worker thread, so the editor never freezes."""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import threading
import time
import uuid

from PySide6.QtCore import QObject, QSize, QUrl, Signal
from PySide6.QtGui import QColor, QImage, QPainter
from PySide6.QtWidgets import QFileDialog

log = logging.getLogger("EquationStudio")

CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
MAX_SOURCE = 2_000_000
MAX_PAGES = 300
STEP_TIMEOUT = 240            # seconds per engine run (the first run may download packages)
MAX_COPY_BYTES = 100_000_000  # the working folder is copied next to the source so \includegraphics etc. work
MAX_COPY_FILES = 3000
ENGINE_ORDER = ["tectonic", "xelatex", "pdflatex", "lualatex"]
COPY_IGNORE = shutil.ignore_patterns("*.pdf", "*.aux", "*.log", "*.toc", "*.out", "*.fls", "*.fdb_latexmk",
                                     "*.synctex.gz", ".git", "__pycache__", "tex_cache", "node_modules")

_FILE_LINE = re.compile(r"(?:^|[\s:(])(?:\./)?main\.tex:(\d+):\s*(.+?)\s*$")
_BANG = re.compile(r"^!\s*(.+?)\s*$")
_LNUM = re.compile(r"^l\.(\d+)\b")


def parse_log(text: str) -> tuple[list[dict], int]:
    """Pull errors (with line numbers when the log has them) and a warning count out of an engine log."""
    errs: list[dict] = []
    seen: set[str] = set()
    lines = text.splitlines()
    warnings = sum(1 for ln in lines if re.search(r"warning:", ln, re.I))
    for i, ln in enumerate(lines):
        m = _FILE_LINE.search(ln)
        if m and not ln.lstrip().lower().startswith(("warning", "note")):
            msg = m.group(2)[:160]
            if msg[:80] not in seen:
                seen.add(msg[:80])
                errs.append({"line": int(m.group(1)), "msg": msg})
            continue
        b = _BANG.match(ln)
        if b:
            msg = b.group(1)[:160]
            line = 0
            for j in range(i + 1, min(i + 8, len(lines))):
                mm = _LNUM.match(lines[j])
                if mm:
                    line = int(mm.group(1))
                    break
            if msg[:80] not in seen:
                seen.add(msg[:80])
                errs.append({"line": line, "msg": msg})
        if len(errs) >= 50:
            break
    return errs, warnings


def read_text(path: str) -> str:
    raw = open(path, "rb").read(MAX_SOURCE + 1)
    if len(raw) > MAX_SOURCE:
        raise ValueError("too large")
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


class TexService(QObject):
    done = Signal(object)  # emitted from the worker thread, delivered in the GUI thread

    def __init__(self, data_dir: str, res_dir: str, send, toast, parent=None) -> None:
        super().__init__(parent)
        self.data_dir, self.res_dir = data_dir, res_dir
        self.cache = os.path.join(data_dir, "tex_cache")
        self.send, self.toast = send, toast
        self.busy = False
        self.cancelled = False
        self.proc: subprocess.Popen | None = None
        self.workdir: str | None = None
        self.last_pdf: str | None = None
        self.done.connect(self._on_done)
        self._clean_cache(keep=0)  # leftovers of an earlier run

    # ------------------------------------------------------------ engines
    def find_engines(self) -> dict[str, str]:
        found: dict[str, str] = {}
        for p in (os.path.join(self.res_dir, "tectonic", "tectonic.exe"),
                  os.path.join(self.data_dir, "tools", "tectonic", "tectonic.exe"), shutil.which("tectonic")):
            if p and os.path.isfile(p):
                found["tectonic"] = p
                break
        for n in ("xelatex", "pdflatex", "lualatex", "bibtex"):
            p = shutil.which(n)
            if p:
                found[n] = p
        return found

    # ------------------------------------------------------------ requests from the page
    def handle(self, req: dict, window) -> None:
        op = req.get("op")
        try:
            if op == "engines":
                self.send({"op": "engines", "found": [k for k in self.find_engines() if k != "bibtex"], "workdir": self.workdir or ""})
            elif op == "compile":
                self.compile(req)
            elif op == "cancel":
                self.cancel()
            elif op == "open":
                self.open_tex(window)
            elif op == "folder":
                self.pick_folder(window)
            elif op == "savetex":
                self.save_tex(window, req)
            elif op == "savepdf":
                self.save_pdf(window)
        except Exception:  # noqa: BLE001
            log.exception("LaTeX Studio request failed")
            self.send({"op": "toast", "msg": "LaTeX Studio hit an error. See equation_studio.log.", "kind": "error"})

    # ------------------------------------------------------------ compile
    def compile(self, req: dict) -> None:
        rid = req.get("id")
        fail = lambda msg, **kw: self.send({"op": "result", "id": rid, "ok": False, "pages": [], "errors": [], "error": msg, **kw})  # noqa: E731
        if self.busy:
            return fail("Another compile is still running.")
        source = req.get("source")
        if not isinstance(source, str) or not source.strip():
            return fail("Write some LaTeX first.")
        if len(source.encode("utf-8", "ignore")) > MAX_SOURCE:
            return fail("The source is too large (max 2 MB).")
        want = req.get("engine")
        found = self.find_engines()
        order = [want] if want in ENGINE_ORDER else ENGINE_ORDER
        engine = next((e for e in order if e in found), None)
        if engine is None:
            extra = "" if want not in ENGINE_ORDER else " (" + str(want) + " is not installed)"
            return fail("No LaTeX engine found." + extra, noengine=True)

        self._clean_cache(keep=2)
        job_id = time.strftime("%H%M%S") + "-" + uuid.uuid4().hex[:6]
        job = os.path.join(self.cache, job_id)
        os.makedirs(job, exist_ok=True)
        note = self._copy_workdir(job)
        with open(os.path.join(job, "main.tex"), "w", encoding="utf-8", newline="\n") as f:
            f.write(source)
        self.busy, self.cancelled = True, False
        threading.Thread(target=self._run, args=(rid, job, engine, found, source, note), daemon=True).start()

    def _copy_workdir(self, job: str) -> str:
        wd = self.workdir
        if not wd or not os.path.isdir(wd):
            return ""
        total = count = 0
        for root_, dirs, files in os.walk(wd):
            dirs[:] = [d for d in dirs if d not in (".git", "__pycache__", "tex_cache", "node_modules")]
            for fn in files:
                count += 1
                try:
                    total += os.path.getsize(os.path.join(root_, fn))
                except OSError:
                    pass
            if total > MAX_COPY_BYTES or count > MAX_COPY_FILES:
                return "The working folder is too large to copy, so its images and files were not used."
        try:
            shutil.copytree(wd, job, ignore=COPY_IGNORE, dirs_exist_ok=True)
        except Exception as e:  # noqa: BLE001
            return "Could not copy the working folder: " + str(e)[:80]
        return ""

    def _exec(self, cmd: list[str], cwd: str, parts: list[str]) -> int:
        try:
            self.proc = subprocess.Popen(cmd, cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                         stderr=subprocess.STDOUT, creationflags=CREATE_NO_WINDOW)
        except OSError as e:
            parts.append("Could not start " + os.path.basename(cmd[0]) + ": " + str(e))
            return -1
        try:
            out, _ = self.proc.communicate(timeout=STEP_TIMEOUT)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            out, _ = self.proc.communicate()
            parts.append(out.decode("utf-8", "replace"))
            parts.append("[stopped: it took longer than " + str(STEP_TIMEOUT) + " seconds]")
            return -2
        parts.append(out.decode("utf-8", "replace"))
        return self.proc.returncode

    def _run(self, rid, job: str, engine: str, found: dict, source: str, note: str) -> None:
        t0 = time.monotonic()
        parts: list[str] = []
        if note:
            parts.append("[note] " + note)
        exe = found[engine]
        try:
            if engine == "tectonic":
                rc = self._exec([exe, "-X", "compile", "--outdir", job, "main.tex"], job, parts)
                if rc != 0 and re.search(r"unrecognized|unexpected argument|found argument", parts[-1], re.I):
                    parts.append("[retrying with the classic command line]")
                    self._exec([exe, "--outdir", job, "main.tex"], job, parts)
            else:
                base = [exe, "-interaction=nonstopmode", "-file-line-error", "-output-directory", job, "main.tex"]
                self._exec(base, job, parts)
                if not self.cancelled and re.search(r"\\(cite|ref|eqref|pageref|tableofcontents|listoffigures|listoftables|label|bibliography)\b", source):
                    if found.get("bibtex") and re.search(r"\\bibliography\{", source):
                        self._exec([found["bibtex"], "main"], job, parts)
                    self._exec(base, job, parts)
                    if not self.cancelled:
                        self._exec(base, job, parts)
        except Exception as e:  # noqa: BLE001
            parts.append("[internal error] " + repr(e))
        text = "\n".join(parts)
        try:
            lp = os.path.join(job, "main.log")
            if os.path.isfile(lp):
                text += "\n" + open(lp, "r", encoding="utf-8", errors="replace").read()[-120000:]
        except OSError:
            pass
        pdf = os.path.join(job, "main.pdf")
        errors, warnings = parse_log(text)
        self.done.emit({"id": rid, "job": job, "pdf": pdf if os.path.isfile(pdf) else None, "engine": engine,
                        "seconds": round(time.monotonic() - t0, 1), "log": text[-200000:], "errors": errors,
                        "warnings": warnings, "cancelled": self.cancelled})

    def _on_done(self, info: dict) -> None:
        self.busy = False
        res = {"op": "result", "id": info["id"], "ok": False, "pages": [], "engine": info["engine"], "seconds": info["seconds"],
               "log": info["log"], "errors": info["errors"], "warnings": info["warnings"], "cancelled": info["cancelled"]}
        pdf = info["pdf"]
        if pdf and not info["cancelled"]:
            try:
                res["pages"] = self.render_pages(pdf, info["job"])
                res["ok"] = bool(res["pages"])
                if res["ok"]:
                    self.last_pdf = pdf
                else:
                    res["error"] = "The PDF has no pages."
            except ImportError:
                res["error"] = "The page preview needs the QtPdf module. Run: pip install --upgrade PySide6"
            except Exception:  # noqa: BLE001
                log.exception("could not render the PDF")
                res["error"] = "Could not display the PDF."
        else:
            res["error"] = "Stopped." if info["cancelled"] else "The document did not compile. See Problems and Log below."
        self.send(res)

    def render_pages(self, pdf: str, job: str) -> list[dict]:
        from PySide6.QtPdf import QPdfDocument  # imported here: the app starts fine without it

        d = QPdfDocument(self)
        d.load(pdf)
        n = d.pageCount()
        pages: list[dict] = []
        for i in range(min(n, MAX_PAGES)):
            sz = d.pagePointSize(i)
            w = 1000
            h = max(1, int(round(w * sz.height() / max(1.0, sz.width()))))
            img = d.render(i, QSize(w, h))
            out = QImage(w, h, QImage.Format.Format_RGB32)
            out.fill(QColor("white"))
            p = QPainter(out)
            p.drawImage(0, 0, img)
            p.end()
            fn = os.path.join(job, "p%d.png" % (i + 1))
            out.save(fn, "PNG")
            pages.append({"url": QUrl.fromLocalFile(fn).toString(), "w": w, "h": h})
        d.close()
        d.deleteLater()
        return pages

    def cancel(self) -> None:
        self.cancelled = True
        p = self.proc
        if p is not None and p.poll() is None:
            try:
                p.kill()
            except OSError:
                pass

    # ------------------------------------------------------------ files and folders
    def open_tex(self, window) -> None:
        start = self.workdir or os.path.join(os.path.expanduser("~"), "Documents")
        path, _ = QFileDialog.getOpenFileName(window, "Open LaTeX file", start, "LaTeX (*.tex);;All files (*)")
        if not path:
            return
        try:
            text = read_text(path)
        except (OSError, ValueError):
            return self.toast("Could not open that file (is it larger than 2 MB?)", "error")
        self.workdir = os.path.dirname(path)
        self.send({"op": "opened", "name": os.path.basename(path), "source": text, "workdir": self.workdir})

    def pick_folder(self, window) -> None:
        start = self.workdir or os.path.join(os.path.expanduser("~"), "Documents")
        path = QFileDialog.getExistingDirectory(window, "Folder with your images and .bib files", start)
        if path:
            self.workdir = path
            self.send({"op": "workdir", "path": path})

    def save_tex(self, window, req: dict) -> None:
        src = req.get("source")
        if not isinstance(src, str) or len(src) > MAX_SOURCE:
            return self.toast("Nothing to save", "warn")
        name = re.sub(r"[^\w.\- ]", "_", str(req.get("name") or "document.tex"))[:60] or "document.tex"
        if not name.lower().endswith(".tex"):
            name += ".tex"
        start = os.path.join(self.workdir or os.path.join(os.path.expanduser("~"), "Documents"), name)
        path, _ = QFileDialog.getSaveFileName(window, "Save LaTeX file", start, "LaTeX (*.tex)")
        if not path:
            return
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(src)
        self.workdir = os.path.dirname(path)
        self.send({"op": "workdir", "path": self.workdir})
        self.toast("Saved: " + os.path.basename(path))

    def save_pdf(self, window) -> None:
        if not self.last_pdf or not os.path.isfile(self.last_pdf):
            return self.toast("Compile first, then save the PDF", "warn")
        start = os.path.join(self.workdir or os.path.join(os.path.expanduser("~"), "Documents"), "document.pdf")
        path, _ = QFileDialog.getSaveFileName(window, "Save PDF", start, "PDF (*.pdf)")
        if not path:
            return
        shutil.copyfile(self.last_pdf, path)
        self.toast("Saved: " + os.path.basename(path))

    # ------------------------------------------------------------ housekeeping
    def _clean_cache(self, keep: int) -> None:
        try:
            if not os.path.isdir(self.cache):
                return
            dirs = sorted((os.path.join(self.cache, d) for d in os.listdir(self.cache)), key=os.path.getmtime, reverse=True)
            for d in dirs[keep:]:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass

    def shutdown(self) -> None:
        self.cancel()
        self._clean_cache(keep=0)
        