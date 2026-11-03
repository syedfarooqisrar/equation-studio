# 📁 FILE: D:\EquationTool\pdf_tools.py
"""PDF tools: merge, extract pages, split every page, rearrange/rotate, compress, compare.
File dialogs run in the main thread; the real work runs in a background thread so the editor never freezes."""
from __future__ import annotations

import difflib
import html
import logging
import os
import re
import threading
from datetime import datetime

from PySide6.QtCore import QObject, Qt, Signal
from PySide6.QtWidgets import (
    QDialog, QDialogButtonBox, QFileDialog, QHBoxLayout, QLabel, QListWidget, QListWidgetItem, QPushButton, QVBoxLayout,
)

log = logging.getLogger("EquationStudio.pdf")

OPS = {"merge", "extract", "each", "arrange", "compress", "compare"}
PDF_FILTER = "PDF document (*.pdf)"
MAX_SPEC_CHARS = 300
MAX_OUT_PAGES = 5000
MAX_DIFF_PAGES = 150
LEVELS = {"high": (80, 2400), "balanced": (60, 1600), "small": (40, 1100)}  # JPEG quality, longest side in px
SPEC_OK = re.compile(r"^[0-9,\-\s]+$")

REPORT_CSS = """
body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#1f2933}
h1{font-size:20px} h2{font-size:15px;margin-top:28px}
.sum{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:12px 16px;margin:12px 0}
table.diff{font-family:Consolas,monospace;font-size:12px;border:1px solid #94a3b8;border-collapse:collapse;margin-bottom:10px}
.diff_header{background:#e2e8f0;text-align:right;padding:0 6px}
.diff_next{background:#cbd5e1}
.diff_add{background:#bbf7d0}
.diff_chg{background:#fef08a}
.diff_sub{background:#fecaca}
td{padding:1px 6px}
"""


class UserError(Exception):
    """A problem the user can understand and fix; its text is shown as-is."""


def human(n: float) -> str:
    for unit in ("B", "KB", "MB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def same_path(a: str, b: str) -> bool:
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def parse_pages(spec: str, total: int) -> list[int]:
    """'1-3, 5, 8-10' -> zero-based page numbers. A reversed range (5-3) lists the pages backwards."""
    spec = (spec or "").strip()
    if not spec or len(spec) > MAX_SPEC_CHARS or not SPEC_OK.match(spec):
        raise UserError("Write pages like 1-3, 5, 8-10")
    out: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
        elif part.isdigit():
            a = b = int(part)
        else:
            raise UserError(f"'{part}' is not a page or a range")
        for n in (a, b):
            if n < 1 or n > total:
                raise UserError(f"Page {n} is outside this PDF (it has {total} pages)")
        step = 1 if b >= a else -1
        out.extend(range(a - 1, b - 1 + step, step))
        if len(out) > MAX_OUT_PAGES:
            raise UserError("Too many pages requested")
    if not out:
        raise UserError("Write pages like 1-3, 5, 8-10")
    return out


def open_reader(path: str):
    from pypdf import PdfReader

    name = os.path.basename(path)
    try:
        reader = PdfReader(path)
        if reader.is_encrypted:
            try:
                ok = reader.decrypt("")
            except Exception:  # noqa: BLE001
                ok = 0
            if not ok:
                raise UserError(f"{name} is password protected. Remove the password first.")
        len(reader.pages)
        return reader
    except UserError:
        raise
    except Exception as e:  # noqa: BLE001
        log.info("could not read %s: %s", path, e)
        raise UserError(f"{name} is not a valid PDF or is damaged") from e


def write_pdf(writer, out: str) -> int:
    """Write to a .part file first so a failed save never leaves a broken PDF behind."""
    tmp = out + ".part"
    try:
        with open(tmp, "wb") as f:
            writer.write(f)
        os.replace(tmp, out)
        return os.path.getsize(out)
    except PermissionError as e:
        _drop(tmp)
        raise UserError("Could not save. If that PDF is open in another program, close it and try again.") from e
    except OSError as e:
        _drop(tmp)
        raise UserError("Could not save the file (disk full or folder not writable)") from e
    except Exception:
        _drop(tmp)
        raise


def _drop(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


# ---------------------------------------------------------------- jobs (run in a background thread)
def job_merge(files: list[str], out: str):
    from pypdf import PdfWriter

    w, total = PdfWriter(), 0
    for f in files:
        r = open_reader(f)
        for p in r.pages:
            w.add_page(p)
            total += 1
        if total > MAX_OUT_PAGES:
            raise UserError("The merged PDF would have too many pages")
    write_pdf(w, out)
    return f"Merged {len(files)} PDFs ({total} pages): {os.path.basename(out)}", None


def job_pages(src: str, out: str, spec: str, rotate: int, what: str):
    from pypdf import PdfWriter

    r = open_reader(src)
    idx = parse_pages(spec, len(r.pages))
    w = PdfWriter()
    for i in idx:
        page = w.add_page(r.pages[i])
        if rotate:
            page.rotate(rotate)
    write_pdf(w, out)
    return f"{what} ({len(idx)} pages): {os.path.basename(out)}", None


def job_each(src: str, folder: str):
    from pypdf import PdfWriter

    r = open_reader(src)
    total = len(r.pages)
    if total > MAX_OUT_PAGES:
        raise UserError("This PDF has too many pages to split")
    stem = os.path.splitext(os.path.basename(src))[0]
    target, n = os.path.join(folder, f"{stem}_pages"), 2
    while os.path.exists(target):  # never write into an existing folder
        target = os.path.join(folder, f"{stem}_pages_{n}")
        n += 1
    try:
        os.makedirs(target)
    except OSError as e:
        raise UserError("Could not create the folder here") from e
    width = max(3, len(str(total)))
    for i in range(total):
        w = PdfWriter()
        w.add_page(r.pages[i])
        write_pdf(w, os.path.join(target, f"{stem}_p{i + 1:0{width}d}.pdf"))
    return f"Split into {total} files: {os.path.basename(target)}", target


def job_compress(src: str, out: str, level: str):
    from pypdf import PdfWriter

    quality, side = LEVELS[level]
    before = os.path.getsize(src)
    r = open_reader(src)
    w = PdfWriter(clone_from=r)
    pictures = 0
    for page in w.pages:
        try:
            for img in page.images:
                try:
                    pil = img.image
                    if pil is None or pil.mode not in ("RGB", "L") or pil.width * pil.height < 20000:
                        continue
                    longest = max(pil.size)
                    if longest > side:
                        k = side / longest
                        pil = pil.resize((max(1, round(pil.width * k)), max(1, round(pil.height * k))))
                    img.replace(pil, quality=quality)
                    pictures += 1
                except Exception as e:  # noqa: BLE001
                    log.info("picture skipped: %s", e)
        except Exception as e:  # noqa: BLE001
            log.info("page pictures skipped: %s", e)
        try:
            page.compress_content_streams()
        except Exception:  # noqa: BLE001
            pass
    try:
        w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    except Exception:  # noqa: BLE001
        pass
    after = write_pdf(w, out)
    if after >= before:
        _drop(out)
        raise UserError("This PDF is already well compressed. A smaller file was not possible, so nothing was saved.")
    saved = round((1 - after / before) * 100)
    note = "" if pictures else " (no pictures found, only the structure was optimized)"
    return f"Compressed: {human(before)} → {human(after)} (−{saved}%){note}", None


def job_compare(a: str, b: str, report: str):
    ra, rb = open_reader(a), open_reader(b)
    ta = [p.extract_text() or "" for p in ra.pages]
    tb = [p.extract_text() or "" for p in rb.pages]
    if not any(t.strip() for t in ta + tb):
        raise UserError("These PDFs have no text (they look scanned). Text must be read with OCR first.")
    hd = difflib.HtmlDiff(wrapcolumn=70)
    parts, differ = [], 0
    pages = max(len(ta), len(tb))
    na, nb = html.escape(os.path.basename(a)), html.escape(os.path.basename(b))
    for i in range(pages):
        xa = ta[i] if i < len(ta) else None
        xb = tb[i] if i < len(tb) else None
        if xa == xb:
            continue
        differ += 1
        if differ > MAX_DIFF_PAGES:
            continue
        la = [x.strip() for x in (xa or "").splitlines() if x.strip()]
        lb = [x.strip() for x in (xb or "").splitlines() if x.strip()]
        table = hd.make_table(la, lb, f"A: page {i + 1}" if xa is not None else "A: (no page)",
                              f"B: page {i + 1}" if xb is not None else "B: (no page)", context=True, numlines=2)
        parts.append(f"<h2>Page {i + 1}</h2>{table}")
    more = f"<p>Only the first {MAX_DIFF_PAGES} different pages are shown.</p>" if differ > MAX_DIFF_PAGES else ""
    summary = (f"<div class='sum'><b>A:</b> {na} ({len(ta)} pages)<br><b>B:</b> {nb} ({len(tb)} pages)<br>"
               f"<b>{differ}</b> of {pages} pages have different text. Only text is compared, not pictures or layout.</div>")
    body = "".join(parts) if parts else "<p>No text differences found.</p>"
    doc = (f"<!DOCTYPE html><html><head><meta charset='utf-8'><title>PDF comparison</title><style>{REPORT_CSS}</style></head>"
           f"<body><h1>PDF comparison</h1>{summary}{body}{more}</body></html>")
    try:
        with open(report, "w", encoding="utf-8") as f:
            f.write(doc)
    except OSError as e:
        raise UserError("Could not write the comparison report") from e
    return (f"{differ} of {pages} pages differ. Report opened." if differ else "No text differences found. Report opened."), report


# ---------------------------------------------------------------- merge order dialog
class MergeDialog(QDialog):
    def __init__(self, parent, start_dir: str) -> None:
        super().__init__(parent)
        self.setWindowTitle("Merge PDFs")
        self.resize(580, 380)
        self.start_dir = start_dir
        lay = QVBoxLayout(self)
        lay.addWidget(QLabel("PDFs are joined from top to bottom. Add at least two files. You can drag to reorder."))
        self.list = QListWidget(self)
        self.list.setSelectionMode(QListWidget.SelectionMode.SingleSelection)
        self.list.setDragDropMode(QListWidget.DragDropMode.InternalMove)
        lay.addWidget(self.list)
        row = QHBoxLayout()
        for text, fn in (("Add PDFs…", self.add), ("Remove", self.remove),
                         ("Move up", lambda _=False: self.move(-1)), ("Move down", lambda _=False: self.move(1))):
            b = QPushButton(text, self)
            b.clicked.connect(fn)
            row.addWidget(b)
        row.addStretch(1)
        lay.addLayout(row)
        self.buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel, self)
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText("Merge")
        self.buttons.accepted.connect(self.accept)
        self.buttons.rejected.connect(self.reject)
        lay.addWidget(self.buttons)
        self.sync()

    def sync(self) -> None:
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setEnabled(self.list.count() >= 2)

    def add(self, _checked: bool = False) -> None:
        paths, _ = QFileDialog.getOpenFileNames(self, "Add PDFs", self.start_dir, PDF_FILTER)
        for p in paths:
            item = QListWidgetItem(f"{os.path.basename(p)}    —    {os.path.dirname(p)}")
            item.setData(Qt.ItemDataRole.UserRole, p)
            self.list.addItem(item)
            self.start_dir = os.path.dirname(p)
        self.sync()

    def remove(self, _checked: bool = False) -> None:
        row = self.list.currentRow()
        if row >= 0:
            self.list.takeItem(row)
        self.sync()

    def move(self, delta: int) -> None:
        row = self.list.currentRow()
        new = row + delta
        if row < 0 or new < 0 or new >= self.list.count():
            return
        item = self.list.takeItem(row)
        self.list.insertItem(new, item)
        self.list.setCurrentRow(new)

    def files(self) -> list[str]:
        return [self.list.item(i).data(Qt.ItemDataRole.UserRole) for i in range(self.list.count())]


# ---------------------------------------------------------------- service
class PdfTools(QObject):
    done = Signal(str, str, str)  # message, kind ("success" / "error"), path to open ("" = none)

    def __init__(self, capture_dir: str, toast, open_path, parent=None) -> None:
        super().__init__(parent)
        self.capture_dir = capture_dir
        self.toast = toast
        self.open_path = open_path
        self.busy = False
        self.last_dir = os.path.join(os.path.expanduser("~"), "Documents")
        self.done.connect(self.on_done)

    # ---------- request from the page ----------
    def handle(self, req: dict, parent) -> None:
        if self.busy:
            return self.toast("Another PDF job is still running. Please wait.", "warn")
        op = req.get("op")
        if op not in OPS:
            log.warning("Ignored unknown PDF request: %r", op)
            return
        spec = req.get("pages") if isinstance(req.get("pages"), str) else ""
        rotate = req.get("rotate") if req.get("rotate") in (0, 90, 180, 270) else 0
        level = req.get("level") if req.get("level") in LEVELS else "balanced"
        try:
            job = self.prepare(op, spec, rotate, level, parent)
        except UserError as e:
            return self.toast(str(e), "error")
        if job is None:
            return self.toast("Cancelled", "warn")
        self.run(job)

    def pick_pdf(self, parent, title: str) -> str | None:
        path, _ = QFileDialog.getOpenFileName(parent, title, self.last_dir, PDF_FILTER)
        if path:
            self.last_dir = os.path.dirname(path)
        return path or None

    def pick_out(self, parent, title: str, src: str, suffix: str, inputs: list[str]) -> str | None:
        stem = os.path.splitext(os.path.basename(src))[0]
        start = os.path.join(os.path.dirname(src), f"{stem}_{suffix}.pdf")
        out, _ = QFileDialog.getSaveFileName(parent, title, start, PDF_FILTER)
        if not out:
            return None
        if not out.lower().endswith(".pdf"):
            out += ".pdf"
        if any(same_path(out, s) for s in inputs):
            raise UserError("Choose a different file name. The original PDF must not be overwritten.")
        return out

    def prepare(self, op: str, spec: str, rotate: int, level: str, parent):
        if op == "merge":
            dlg = MergeDialog(parent, self.last_dir)
            if dlg.exec() != QDialog.DialogCode.Accepted:
                return None
            files = dlg.files()
            self.last_dir = os.path.dirname(files[0])
            out = self.pick_out(parent, "Save the merged PDF", files[0], "merged", files)
            return (lambda: job_merge(files, out)) if out else None

        if op == "compare":
            a = self.pick_pdf(parent, "Choose the FIRST PDF (original)")
            if not a:
                return None
            b = self.pick_pdf(parent, "Choose the SECOND PDF (changed)")
            if not b:
                return None
            if same_path(a, b):
                raise UserError("Choose two different PDF files")
            os.makedirs(self.capture_dir, exist_ok=True)
            report = os.path.join(self.capture_dir, f"compare_{datetime.now():%Y%m%d_%H%M%S}.html")
            return lambda: job_compare(a, b, report)

        src = self.pick_pdf(parent, "Choose a PDF")
        if not src:
            return None
        if op == "each":
            folder = QFileDialog.getExistingDirectory(parent, "Choose where to save the pages", os.path.dirname(src))
            return (lambda: job_each(src, folder)) if folder else None

        suffix = {"extract": "extract", "arrange": "arranged", "compress": "compressed"}[op]
        title = {"extract": "Save the extracted pages", "arrange": "Save the rearranged PDF", "compress": "Save the smaller PDF"}[op]
        out = self.pick_out(parent, title, src, suffix, [src])
        if not out:
            return None
        if op == "extract":
            return lambda: job_pages(src, out, spec, 0, "Extracted")
        if op == "arrange":
            return lambda: job_pages(src, out, spec, rotate, "Rearranged")
        return lambda: job_compress(src, out, level)

    # ---------- background work ----------
    def run(self, job) -> None:
        self.busy = True
        self.toast("Working…", "warn")

        def work() -> None:
            try:
                msg, path = job()
                self.done.emit(msg, "success", path or "")
            except UserError as e:
                self.done.emit(str(e), "error", "")
            except ImportError:
                self.done.emit("pypdf is missing. Run: pip install pypdf", "error", "")
            except MemoryError:
                self.done.emit("This PDF is too large for the memory available", "error", "")
            except Exception:  # noqa: BLE001
                log.exception("PDF job failed")
                self.done.emit("Could not finish. Details are in equation_studio.log", "error", "")

        threading.Thread(target=work, daemon=True).start()

    def on_done(self, msg: str, kind: str, path: str) -> None:
        self.busy = False
        self.toast(msg, kind)
        if kind == "success" and path:
            self.open_path(path)