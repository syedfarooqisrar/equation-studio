# 📁 FILE: D:\EquationTool\ocr_tools.py
"""OCR for scanned PDFs with Tesseract (free, installed separately).
Pages are drawn with QtPdf in the main thread (one per timer tick), then Tesseract reads them in a background thread."""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import threading

from PySide6.QtCore import QSize, QTimer, Signal
from PySide6.QtGui import QColor, QImage, QPainter
from PySide6.QtWidgets import QFileDialog

from pdf_tools import PdfTools, UserError, write_pdf

log = logging.getLogger("EquationStudio.ocr")

LANGS = ("eng", "urd", "eng+urd")
MAX_OCR_PAGES = 200
MAX_RENDER_SIDE = 7000
PAGE_TIMEOUT_S = 180
NO_WINDOW = 0x08000000 if os.name == "nt" else 0
INSTALL_HINT = ("Tesseract is not installed. Free download: github.com/UB-Mannheim/tesseract/wiki "
                "(tick Urdu in the installer if you need it).")


def find_tesseract(dirs) -> str | None:
    for base in dirs:
        for sub in (("tools", "tesseract"), ("tesseract",)):
            p = os.path.join(base, *sub, "tesseract.exe")
            if os.path.isfile(p):
                return p
    p = shutil.which("tesseract")
    if p:
        return p
    for env, sub in (("ProgramFiles", ""), ("ProgramFiles(x86)", ""), ("LOCALAPPDATA", "Programs")):
        base = os.environ.get(env)
        if base:
            c = os.path.join(base, sub, "Tesseract-OCR", "tesseract.exe") if sub else os.path.join(base, "Tesseract-OCR", "tesseract.exe")
            if os.path.isfile(c):
                return c
    return None


def installed_langs(exe: str) -> set[str]:
    try:
        res = subprocess.run([exe, "--list-langs"], capture_output=True, timeout=30, creationflags=NO_WINDOW)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise UserError("Tesseract could not be started") from e
    text = (res.stdout or b"").decode("utf-8", "replace") + "\n" + (res.stderr or b"").decode("utf-8", "replace")
    return {ln.strip() for ln in text.splitlines() if ln.strip() and " " not in ln.strip() and not ln.startswith("List")}


def err_line(res) -> str:
    text = (res.stderr or b"").decode("utf-8", "replace").strip()
    return text.splitlines()[0][:150] if text else "unknown problem"


class OcrTools(PdfTools):
    step = Signal(str)

    def __init__(self, capture_dir: str, toast, open_path, data_dir: str, res_dir: str, parent=None) -> None:
        super().__init__(capture_dir, toast, open_path, parent)
        self.dirs = (data_dir, res_dir)
        self._ocr: dict | None = None
        self.step.connect(lambda m: self.toast(m, "warn"))

    # ---------- request ----------
    def handle(self, req: dict, parent) -> None:
        if self.busy:
            return self.toast("Another job is still running. Please wait.", "warn")
        lang = req.get("lang") if req.get("lang") in LANGS else "eng"
        mode = "txt" if req.get("out") == "txt" else "pdf"
        dpi = req.get("dpi") if req.get("dpi") in (200, 300) else 300
        try:
            exe = find_tesseract(self.dirs)
            if not exe:
                raise UserError(INSTALL_HINT)
            src = self.pick_pdf(parent, "Choose a scanned PDF")
            if not src:
                return self.toast("Cancelled", "warn")
            out = self.pick_target(parent, src, mode)
            if not out:
                return self.toast("Cancelled", "warn")
            have = installed_langs(exe)
            missing = [x for x in lang.split("+") if x not in have]
            if missing:
                raise UserError("Language data is missing: " + ", ".join(missing) +
                                ". Reinstall Tesseract and tick the language, or copy its .traineddata file into the tessdata folder.")
            self.busy = True
            self.toast("Preparing pages…", "warn")
            self.start_render(src, out, exe, lang, mode, dpi)
        except UserError as e:
            self.busy = False
            self.toast(str(e), "error")
        except Exception:  # noqa: BLE001
            self.busy = False
            log.exception("OCR could not start")
            self.toast("Could not start. Details are in equation_studio.log", "error")

    def pick_target(self, parent, src: str, mode: str) -> str | None:
        if mode == "pdf":
            return self.pick_out(parent, "Save the searchable PDF", src, "ocr", [src])
        stem = os.path.splitext(os.path.basename(src))[0]
        out, _ = QFileDialog.getSaveFileName(parent, "Save the text", os.path.join(os.path.dirname(src), stem + ".txt"), "Text file (*.txt)")
        if not out:
            return None
        return out if out.lower().endswith(".txt") else out + ".txt"

    # ---------- step 1: draw the pages (main thread, one page per tick) ----------
    def start_render(self, src, out, exe, lang, mode, dpi) -> None:
        from PySide6.QtPdf import QPdfDocument

        doc = QPdfDocument(self)
        err = doc.load(src)
        name = os.path.basename(src)
        if err != QPdfDocument.Error.None_:
            doc.deleteLater()
            if err == QPdfDocument.Error.IncorrectPassword:
                raise UserError(f"{name} is password protected. Remove the password first.")
            raise UserError(f"{name} is not a valid PDF or is damaged")
        total = doc.pageCount()
        if total < 1 or total > MAX_OCR_PAGES:
            doc.close()
            doc.deleteLater()
            raise UserError("This PDF has no pages" if total < 1 else f"Too many pages for OCR (maximum {MAX_OCR_PAGES}). Split it first.")
        self._ocr = {"doc": doc, "n": total, "i": 0, "files": [], "tmp": tempfile.mkdtemp(prefix="eqocr_"),
                     "src": src, "out": out, "exe": exe, "lang": lang, "mode": mode, "dpi": dpi}
        QTimer.singleShot(0, self._tick)

    def _abort(self, msg: str) -> None:
        s, self._ocr = self._ocr, None
        if s:
            try:
                s["doc"].close()
                s["doc"].deleteLater()
            except Exception:  # noqa: BLE001
                pass
            shutil.rmtree(s["tmp"], ignore_errors=True)
        self.done.emit(msg, "error", "")

    def _tick(self) -> None:
        s = self._ocr
        if not s:
            return
        try:
            i = s["i"]
            if i >= s["n"]:
                self._ocr = None
                try:
                    s["doc"].close()
                    s["doc"].deleteLater()
                except Exception:  # noqa: BLE001
                    pass
                threading.Thread(target=self._work, args=(s,), daemon=True).start()
                return
            pt = s["doc"].pagePointSize(i)
            k = s["dpi"] / 72.0
            w, h = max(1, round(pt.width() * k)), max(1, round(pt.height() * k))
            longest = max(w, h)
            if longest > MAX_RENDER_SIDE:
                w, h = max(1, round(w * MAX_RENDER_SIDE / longest)), max(1, round(h * MAX_RENDER_SIDE / longest))
            img = s["doc"].render(i, QSize(w, h))
            if img.isNull():
                raise RuntimeError(f"page {i + 1} could not be drawn")
            canvas = QImage(img.size(), QImage.Format.Format_RGB32)
            canvas.fill(QColor("white"))
            painter = QPainter(canvas)
            painter.drawImage(0, 0, img)
            painter.end()
            ext = "jpg" if s["mode"] == "pdf" else "png"
            path = os.path.join(s["tmp"], f"p{i:04d}.{ext}")
            ok = canvas.save(path, "JPG", 88) if ext == "jpg" else canvas.save(path, "PNG")
            if not ok:
                return self._abort("Could not save a temporary picture (disk full?)")
            s["files"].append(path)
            s["i"] = i + 1
            if s["i"] % 4 == 0:
                self.toast(f"Preparing pages… {s['i']} of {s['n']}", "warn")
            QTimer.singleShot(0, self._tick)
        except Exception:  # noqa: BLE001
            log.exception("OCR page drawing failed")
            self._abort("Could not prepare the pages. Details are in equation_studio.log")

    # ---------- step 2: Tesseract reads each page (background thread) ----------
    def _work(self, s: dict) -> None:
        tmp = s["tmp"]
        try:
            files, n, pdf = s["files"], len(s["files"]), s["mode"] == "pdf"
            bases = []
            for idx, img in enumerate(files):
                self.step.emit(f"Reading text… page {idx + 1} of {n}")
                base = os.path.join(tmp, f"o{idx:04d}")
                args = [s["exe"], img, base, "-l", s["lang"], "--dpi", str(s["dpi"])] + (["pdf"] if pdf else [])
                try:
                    res = subprocess.run(args, capture_output=True, timeout=PAGE_TIMEOUT_S, creationflags=NO_WINDOW)
                except subprocess.TimeoutExpired as e:
                    raise UserError(f"Page {idx + 1} took too long and was stopped") from e
                result = base + (".pdf" if pdf else ".txt")
                if res.returncode != 0 or not os.path.isfile(result):
                    raise UserError(f"Text recognition failed on page {idx + 1}: {err_line(res)}")
                bases.append(result)

            out = s["out"]
            if pdf:
                from pypdf import PdfReader, PdfWriter

                w = PdfWriter()
                for p in bases:
                    w.add_page(PdfReader(p).pages[0])
                write_pdf(w, out)
                msg = f"Searchable PDF saved ({n} pages): {os.path.basename(out)}"
            else:
                parts, found = [], False
                for idx, p in enumerate(bases, 1):
                    with open(p, "r", encoding="utf-8", errors="replace") as f:
                        t = f.read().strip()
                    found = found or bool(t)
                    parts.append(f"--- Page {idx} ---\n{t}")
                if not found:
                    raise UserError("No text was found. Try 300 dpi, or check that the language is right.")
                part = out + ".part"
                try:
                    with open(part, "w", encoding="utf-8") as f:
                        f.write("\n\n".join(parts) + "\n")
                    os.replace(part, out)
                except OSError as e:
                    try:
                        os.remove(part)
                    except OSError:
                        pass
                    raise UserError("Could not save the file. If it is open in another program, close it and try again.") from e
                msg = f"Text saved ({n} pages): {os.path.basename(out)}"
            self.done.emit(msg, "success", out)
        except UserError as e:
            self.done.emit(str(e), "error", "")
        except ImportError:
            self.done.emit("pypdf is missing. Run: pip install pypdf", "error", "")
        except Exception:  # noqa: BLE001
            log.exception("OCR failed")
            self.done.emit("Could not finish. Details are in equation_studio.log", "error", "")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)