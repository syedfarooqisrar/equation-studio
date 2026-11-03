# 📁 FILE: D:\EquationTool\convert_tools.py
"""Converters: Word to PDF, PDF to Word, document to document, pictures to PDF, PDF to pictures.
File dialogs and PDF rendering run in the main thread; everything else runs in a background thread."""
from __future__ import annotations

import html
import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from PySide6.QtCore import QSize, QTimer
from PySide6.QtGui import QColor, QImage, QPainter
from PySide6.QtWidgets import QDialog, QDialogButtonBox, QFileDialog

from export_service import FORMATS
from pdf_tools import PDF_FILTER, MergeDialog, PdfTools, UserError, _drop, open_reader, same_path
from ocr_tools import OcrTools

log = logging.getLogger("EquationStudio.convert")

CONV_OPS = {"word2pdf", "pdf2word", "doc2doc", "img2pdf", "pdf2img", "ocr"}
NO_WINDOW = 0x08000000 if os.name == "nt" else 0
WORD_FILTER = "Word / OpenDocument (*.docx *.doc *.odt *.rtf)"
DOC_FILTER = "Documents (*.docx *.odt *.html *.htm *.md *.tex *.epub *.txt)"
IMG_FILTER = "Pictures (*.png *.jpg *.jpeg *.bmp *.gif *.tif *.tiff *.webp)"
PANDOC_READERS = {".docx": "docx", ".odt": "odt", ".html": "html", ".htm": "html",
                  ".md": "markdown", ".tex": "latex", ".epub": "epub", ".txt": "markdown"}
MAX_IMAGES = 300
MAX_RENDER_PAGES = 500
MAX_RENDER_SIDE = 6000


# ---------------------------------------------------------------- finding the helper programs
def find_pandoc(dirs) -> str | None:
    for base in dirs:
        for sub in (("tools", "pandoc"), ("pandoc",)):
            p = os.path.join(base, *sub, "pandoc.exe")
            if os.path.isfile(p):
                return p
    return shutil.which("pandoc")


def find_tectonic(dirs) -> str | None:
    for base in dirs:
        for sub in (("tools", "tectonic"), ("tectonic",)):
            p = os.path.join(base, *sub, "tectonic.exe")
            if os.path.isfile(p):
                return p
    return shutil.which("tectonic")


def find_soffice() -> str | None:
    p = shutil.which("soffice")
    if p:
        return p
    for env in ("ProgramFiles", "ProgramFiles(x86)"):
        base = os.environ.get(env)
        if base:
            c = os.path.join(base, "LibreOffice", "program", "soffice.exe")
            if os.path.isfile(c):
                return c
    return None


def run_cmd(args: list[str], timeout: int, cwd: str | None = None):
    try:
        return subprocess.run(args, capture_output=True, timeout=timeout, cwd=cwd, creationflags=NO_WINDOW)
    except subprocess.TimeoutExpired as e:
        raise UserError("The conversion took too long and was stopped") from e
    except OSError as e:
        raise UserError("Could not start the converter program") from e


def err_line(res) -> str:
    text = (res.stderr or b"").decode("utf-8", "replace").strip()
    return text.splitlines()[0][:150] if text else "unknown problem"


def finish_file(part: str, out: str) -> None:
    try:
        os.replace(part, out)
    except PermissionError as e:
        _drop(part)
        raise UserError("Could not save. If that file is open in another program, close it and try again.") from e
    except OSError as e:
        _drop(part)
        raise UserError("Could not save the file (disk full or folder not writable)") from e


def unique_dir(parent_dir: str, name: str) -> str:
    target, n = os.path.join(parent_dir, name), 2
    while os.path.exists(target):  # never write into an existing folder
        target = os.path.join(parent_dir, f"{name}_{n}")
        n += 1
    try:
        os.makedirs(target)
    except OSError as e:
        raise UserError("Could not create the folder here") from e
    return target


# ---------------------------------------------------------------- jobs (background thread)
def job_word2pdf(src: str, out: str, dirs):
    ext = os.path.splitext(src)[1].lower()
    soffice = find_soffice()
    tmp = tempfile.mkdtemp(prefix="eqconv_")
    try:
        if soffice:
            profile = Path(os.path.join(tmp, "profile")).as_uri()  # own profile: works even if LibreOffice is open
            res = run_cmd([soffice, f"-env:UserInstallation={profile}", "--headless", "--convert-to", "pdf",
                           "--outdir", tmp, src], 180)
            made = os.path.join(tmp, os.path.splitext(os.path.basename(src))[0] + ".pdf")
            if res.returncode != 0 or not os.path.isfile(made):
                raise UserError("LibreOffice could not convert this file: " + err_line(res))
            how = "LibreOffice"
        else:
            if ext not in (".docx", ".odt"):
                raise UserError("This file type needs LibreOffice (free, libreoffice.org). Install it and try again.")
            pandoc, tectonic = find_pandoc(dirs), find_tectonic(dirs)
            if not pandoc:
                raise UserError("Pandoc is missing. Run tools\\download_pandoc.ps1, or install LibreOffice (free).")
            if not tectonic:
                raise UserError("No PDF engine found. Install LibreOffice (free, libreoffice.org) and try again.")
            made = os.path.join(tmp, "out.pdf")
            res = run_cmd([pandoc, "-f", PANDOC_READERS[ext], "-o", made, "--pdf-engine=" + tectonic, src], 240, cwd=tmp)
            if res.returncode != 0 or not os.path.isfile(made):
                raise UserError("Could not convert: " + err_line(res) + " (Tectonic needs internet on its first run)")
            how = "simple layout, install LibreOffice for exact layout"
        part = out + ".part"
        try:
            shutil.copyfile(made, part)
        except OSError as e:
            raise UserError("Could not save the file (disk full or folder not writable)") from e
        finish_file(part, out)
        return f"Saved PDF ({how}): {os.path.basename(out)}", None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def job_pdf2word(src: str, out: str, dirs):
    part = out + ".part"
    reader = open_reader(src)  # also catches damaged and password-protected files
    try:
        from pdf2docx import Converter  # type: ignore[import-not-found]  # optional: keeps the layout and tables
    except ImportError:
        Converter = None
    if Converter is not None:
        try:
            cv = Converter(src)
            try:
                cv.convert(part)
            finally:
                cv.close()
            finish_file(part, out)
            return f"Converted with layout: {os.path.basename(out)}", None
        except UserError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("pdf2docx failed, using the text-only method")
            _drop(part)

    pandoc = find_pandoc(dirs)
    if not pandoc:
        raise UserError("Pandoc is missing. Run tools\\download_pandoc.ps1")
    pages = [p.extract_text() or "" for p in reader.pages]
    if not any(t.strip() for t in pages):
        raise UserError("This PDF has no text (it looks scanned). It needs OCR first.")
    stem = html.escape(os.path.splitext(os.path.basename(src))[0])
    blocks = []
    for t in pages:
        paras = [x.strip().replace("\n", " ") for x in re.split(r"\n\s*\n", t) if x.strip()]
        blocks.append("".join("<p>" + html.escape(p) + "</p>" for p in paras))
    doc = f"<html><head><meta charset='utf-8'><title>{stem}</title></head><body>" + "<hr/>".join(blocks) + "</body></html>"
    tmp = tempfile.mkdtemp(prefix="eqconv_")
    try:
        inp = os.path.join(tmp, "input.html")
        with open(inp, "w", encoding="utf-8") as f:
            f.write(doc)
        res = run_cmd([pandoc, "-f", "html", "-t", "docx", "-o", part, inp], 120, cwd=tmp)
        if res.returncode != 0 or not os.path.isfile(part):
            _drop(part)
            raise UserError("Could not convert: " + err_line(res))
        finish_file(part, out)
    except OSError as e:
        raise UserError("Could not prepare the file (disk full?)") from e
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return f"Saved as a text-only Word file (no layout): {os.path.basename(out)}", None


def job_doc2doc(src: str, out: str, target: str, dirs):
    reader = PANDOC_READERS.get(os.path.splitext(src)[1].lower())
    if not reader:
        raise UserError("This file type is not supported. Use .docx, .odt, .html, .md, .tex, .epub or .txt")
    pandoc = find_pandoc(dirs)
    if not pandoc:
        raise UserError("Pandoc is missing. Run tools\\download_pandoc.ps1")
    writer_args = FORMATS[target][2]
    part = out + ".part"
    args = [pandoc, "-f", reader, *writer_args]
    if target in ("md", "html", "tex", "txt") and reader in ("docx", "odt", "epub"):
        stem = os.path.splitext(os.path.basename(out))[0]
        args.append("--extract-media=" + os.path.join(os.path.dirname(out), stem + "_media"))
    args += ["-o", part, src]
    res = run_cmd(args, 120, cwd=os.path.dirname(src))
    if res.returncode != 0 or not os.path.isfile(part):
        _drop(part)
        raise UserError("Could not convert: " + err_line(res))
    finish_file(part, out)
    return f"Converted: {os.path.basename(out)}", None


def job_img2pdf(files: list[str], out: str):
    from PIL import Image, ImageOps

    if len(files) > MAX_IMAGES:
        raise UserError(f"Too many pictures (maximum {MAX_IMAGES})")
    pages = []
    for f in files:
        try:
            im = ImageOps.exif_transpose(Image.open(f))
            if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                im = im.convert("RGBA")
                bg = Image.new("RGB", im.size, "white")
                bg.paste(im, mask=im.split()[3])
                im = bg
            elif im.mode != "RGB":
                im = im.convert("RGB")
            pages.append(im)
        except Exception as e:  # noqa: BLE001
            raise UserError(f"{os.path.basename(f)} could not be opened as a picture") from e
    part = out + ".part"
    try:
        pages[0].save(part, "PDF", save_all=True, append_images=pages[1:], resolution=150.0)
    except OSError as e:
        _drop(part)
        raise UserError("Could not save the file (disk full or folder not writable)") from e
    finish_file(part, out)
    return f"Created a PDF from {len(pages)} pictures: {os.path.basename(out)}", None


# ---------------------------------------------------------------- dialog for ordering pictures
class ImageDialog(MergeDialog):
    def __init__(self, parent, start_dir: str) -> None:
        super().__init__(parent, start_dir)
        self.setWindowTitle("Pictures to PDF")
        self.intro.setText("Each picture becomes one page, from top to bottom. You can drag to reorder.")
        self.flt = IMG_FILTER
        self.min_files = 1
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText("Create PDF")
        self.sync()


# ---------------------------------------------------------------- service
class ConvertTools(PdfTools):
    def __init__(self, capture_dir: str, toast, open_path, data_dir: str, res_dir: str, parent=None) -> None:
        super().__init__(capture_dir, toast, open_path, parent)
        self.dirs = (data_dir, res_dir)
        self._img: dict | None = None
        self.ocr = OcrTools(capture_dir, toast, open_path, data_dir, res_dir, self)

    def handle(self, req: dict, parent) -> None:
        if self.busy:
            return self.toast("Another job is still running. Please wait.", "warn")
        op = req.get("op")
        if op == "ocr":
            return self.ocr.handle(req, parent)
        if op not in CONV_OPS:
            return
        target = req.get("target") if req.get("target") in FORMATS else "docx"
        dpi = req.get("dpi") if req.get("dpi") in (100, 150, 200, 300) else 150
        fmt = "jpg" if req.get("fmt") == "jpg" else "png"
        try:
            job = self.prepare_conv(op, target, dpi, fmt, parent)
        except UserError as e:
            return self.toast(str(e), "error")
        if job is None:
            return self.toast("Cancelled", "warn")
        if op == "pdf2img":  # PDF rendering must happen in the main thread
            self.busy = True
            self.toast("Working…", "warn")
            try:
                job()
            except UserError as e:
                self.done.emit(str(e), "error", "")
            except Exception:  # noqa: BLE001
                log.exception("PDF to pictures failed")
                self.done.emit("Could not finish. Details are in equation_studio.log", "error", "")
        else:
            self.run(job)

    def pick_file(self, parent, title: str, flt: str) -> str | None:
        path, _ = QFileDialog.getOpenFileName(parent, title, self.last_dir, flt)
        if path:
            self.last_dir = os.path.dirname(path)
        return path or None

    def pick_save(self, parent, title: str, src: str, ext: str, flt: str) -> str | None:
        stem = os.path.splitext(os.path.basename(src))[0]
        out, _ = QFileDialog.getSaveFileName(parent, title, os.path.join(os.path.dirname(src), f"{stem}.{ext}"), flt)
        if not out:
            return None
        if not out.lower().endswith("." + ext):
            out += "." + ext
        if same_path(out, src):
            raise UserError("Choose a different file name. The original must not be overwritten.")
        return out

    def prepare_conv(self, op: str, target: str, dpi: int, fmt: str, parent):
        dirs = self.dirs
        if op == "img2pdf":
            dlg = ImageDialog(parent, self.last_dir)
            if dlg.exec() != QDialog.DialogCode.Accepted:
                return None
            files = dlg.files()
            self.last_dir = os.path.dirname(files[0])
            out = self.pick_save(parent, "Save the PDF", files[0], "pdf", PDF_FILTER)
            return (lambda: job_img2pdf(files, out)) if out else None

        if op == "word2pdf":
            src = self.pick_file(parent, "Choose a Word document", WORD_FILTER)
            out = self.pick_save(parent, "Save the PDF", src, "pdf", PDF_FILTER) if src else None
            return (lambda: job_word2pdf(src, out, dirs)) if out else None

        if op == "pdf2word":
            src = self.pick_file(parent, "Choose a PDF", PDF_FILTER)
            out = self.pick_save(parent, "Save the Word document", src, "docx", "Word document (*.docx)") if src else None
            return (lambda: job_pdf2word(src, out, dirs)) if out else None

        if op == "doc2doc":
            src = self.pick_file(parent, "Choose a document", DOC_FILTER)
            flt, ext, _ = FORMATS[target]
            out = self.pick_save(parent, "Save as", src, ext, flt) if src else None
            return (lambda: job_doc2doc(src, out, target, dirs)) if out else None

        src = self.pick_file(parent, "Choose a PDF", PDF_FILTER)  # pdf2img
        if not src:
            return None
        folder = QFileDialog.getExistingDirectory(parent, "Choose where to save the pictures", os.path.dirname(src))
        return (lambda: self.start_images(src, folder, dpi, fmt)) if folder else None

    # ---------- PDF to pictures: one page per timer tick, so the editor stays responsive ----------
    def start_images(self, src: str, folder: str, dpi: int, fmt: str) -> None:
        from PySide6.QtPdf import QPdfDocument

        doc = QPdfDocument(self)
        err = doc.load(src)
        if err != QPdfDocument.Error.None_:
            doc.deleteLater()
            if err == QPdfDocument.Error.IncorrectPassword:
                raise UserError(f"{os.path.basename(src)} is password protected. Remove the password first.")
            raise UserError(f"{os.path.basename(src)} is not a valid PDF or is damaged")
        total = doc.pageCount()
        if total < 1 or total > MAX_RENDER_PAGES:
            doc.close()
            doc.deleteLater()
            raise UserError("This PDF has no pages" if total < 1 else f"Too many pages (maximum {MAX_RENDER_PAGES})")
        stem = os.path.splitext(os.path.basename(src))[0]
        try:
            target = unique_dir(folder, f"{stem}_images")
        except UserError:
            doc.close()
            doc.deleteLater()
            raise
        self._img = {"doc": doc, "n": total, "i": 0, "dpi": dpi, "fmt": fmt, "folder": target,
                     "stem": stem, "width": max(3, len(str(total)))}
        QTimer.singleShot(0, self._img_tick)

    def _img_end(self, msg: str, kind: str) -> None:
        s, self._img = self._img, None
        path = ""
        if s:
            path = s["folder"] if kind == "success" else ""
            try:
                s["doc"].close()
                s["doc"].deleteLater()
            except Exception:  # noqa: BLE001
                pass
        self.done.emit(msg, kind, path)

    def _img_tick(self) -> None:
        s = self._img
        if not s:
            return
        try:
            i = s["i"]
            if i >= s["n"]:
                return self._img_end(f"Saved {s['n']} pictures in the folder {os.path.basename(s['folder'])}", "success")
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
            name = os.path.join(s["folder"], f"{s['stem']}_p{i + 1:0{s['width']}d}.{s['fmt']}")
            ok = canvas.save(name, "PNG") if s["fmt"] == "png" else canvas.save(name, "JPG", 90)
            if not ok:
                return self._img_end("Could not save a picture (disk full?)", "error")
            s["i"] = i + 1
            if s["i"] % 4 == 0:
                self.toast(f"Working… page {s['i']} of {s['n']}", "warn")
            QTimer.singleShot(0, self._img_tick)
        except Exception:  # noqa: BLE001
            log.exception("PDF to pictures failed")
            self._img_end("Could not finish. Details are in equation_studio.log", "error")