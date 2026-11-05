# 📁 FILE: D:\EquationTool\table_extract.py
"""Tables from PDF (text-based), Word (.docx) and web (.html) files, sent to Data Studio.
The work runs in a background thread. Scanned PDFs have no text, so nothing is found there (use OCR first)."""
from __future__ import annotations

import logging
import os
import re
import threading
import xml.etree.ElementTree as ET
import zipfile
from html.parser import HTMLParser

from PySide6.QtCore import QObject, Signal
from PySide6.QtWidgets import QFileDialog

log = logging.getLogger("EquationStudio.tables")

MAX_FILE_BYTES = 80 * 1024 * 1024
MAX_PDF_PAGES = 300
MAX_TABLES = 200
MAX_CELLS = 300_000
MAX_DOCX_XML = 120 * 1024 * 1024
MIN_ROWS = {"lined": 2, "text": 3}
MIN_COLS = {"lined": 2, "text": 3}
URDU_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
NUM_PLAIN = re.compile(r"^\d+(\.\d+)?$")
NUM_COMMA = re.compile(r"^\d{1,3}(,\d{3})+(\.\d+)?$")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class TableError(Exception):
    """A problem the user can understand; its text is shown as-is."""


# ---------------------------------------------------------------- cleaning
def clean_cell(x):
    if x is None:
        return None
    t = re.sub(r"\s+", " ", str(x)).strip()
    return t or None


def smart_number(text: str):
    """'1,234' -> 1234, '(500)' -> -500, '۱۲۳' -> 123. IDs like 007 or 16+ digits stay text."""
    t = text.strip().translate(URDU_DIGITS)
    neg = False
    if len(t) > 2 and t.startswith("(") and t.endswith(")"):
        neg, t = True, t[1:-1].strip()
    elif t[:1] == "-":
        neg, t = True, t[1:]
    elif t[:1] == "+":
        t = t[1:]
    if not (NUM_PLAIN.match(t) or NUM_COMMA.match(t)):
        return text
    digits = t.replace(",", "")
    if len(digits.split(".")[0]) > 15 or (NUM_PLAIN.match(t) and len(t) > 1 and t[0] == "0" and not t.startswith("0.")):
        return text
    value = float(digits)
    value = int(value) if "." not in digits else value
    return -value if neg else value


def tidy(rows, mode: str):
    rows = [[clean_cell(c) for c in row] for row in (rows or []) if row]
    if not rows:
        return None
    width = max(len(r) for r in rows)
    rows = [r + [None] * (width - len(r)) for r in rows]
    rows = [r for r in rows if any(r)]
    if not rows:
        return None
    keep = [c for c in range(width) if any(r[c] for r in rows)]
    rows = [[r[c] for c in keep] for r in rows]
    if len(rows) < MIN_ROWS[mode] or len(rows[0]) < MIN_COLS[mode]:
        return None
    return rows


# ---------------------------------------------------------------- readers
def extract_pdf(path: str, mode: str, progress):
    import pdfplumber

    settings = ({"vertical_strategy": "lines", "horizontal_strategy": "lines", "snap_tolerance": 3, "join_tolerance": 3}
                if mode == "lined" else
                {"vertical_strategy": "text", "horizontal_strategy": "text", "snap_tolerance": 4,
                 "text_x_tolerance": 3, "text_y_tolerance": 3})
    tables, text_pages, truncated = [], 0, False
    try:
        pdf = pdfplumber.open(path)
    except Exception as e:  # noqa: BLE001
        log.info("pdf open failed: %s", e)
        if "assword" in type(e).__name__:
            raise TableError(f"{os.path.basename(path)} is password protected. Remove the password first.") from e
        raise TableError(f"{os.path.basename(path)} is not a valid PDF or is damaged") from e
    with pdf:
        total = len(pdf.pages)
        if total > MAX_PDF_PAGES:
            raise TableError(f"This PDF has {total} pages (maximum {MAX_PDF_PAGES}). Cut it first with Tools → Extract.")
        for i, page in enumerate(pdf.pages, start=1):
            if i % 5 == 1:
                progress(f"Reading page {i} of {total}…")
            found = []
            try:
                if page.chars:
                    text_pages += 1
                found = page.extract_tables(settings) or []
            except Exception as e:  # noqa: BLE001
                log.info("page %s skipped: %s", i, e)
            finally:
                try:
                    page.close()
                except Exception:  # noqa: BLE001
                    pass
            for k, raw in enumerate(found, start=1):
                rows = tidy(raw, mode)
                if rows:
                    tables.append((f"Page {i} · table {k}", f"P{i}-T{k}", rows))
            if len(tables) >= MAX_TABLES:
                truncated = True
                break
    return tables, text_pages == 0, truncated


def extract_docx(path: str):
    try:
        with zipfile.ZipFile(path) as z:
            if z.getinfo("word/document.xml").file_size > MAX_DOCX_XML:
                raise TableError("This Word file is too large to read")
            root = ET.fromstring(z.read("word/document.xml"))
    except TableError:
        raise
    except (zipfile.BadZipFile, KeyError, ET.ParseError, OSError) as e:
        raise TableError(f"{os.path.basename(path)} is not a valid .docx file (old .doc files: save as .docx first)") from e
    body = root.find(W + "body")
    tables = []
    for tbl in (list(body) if body is not None else []):
        if tbl.tag != W + "tbl":
            continue
        rows = []
        for tr in tbl.findall(W + "tr"):
            row = []
            for tc in tr.findall(W + "tc"):
                pr = tc.find(W + "tcPr")
                span, vmerge_cont = 1, False
                if pr is not None:
                    gs = pr.find(W + "gridSpan")
                    if gs is not None:
                        try:
                            span = max(1, min(int(gs.get(W + "val", "1")), 50))
                        except ValueError:
                            span = 1
                    vm = pr.find(W + "vMerge")
                    vmerge_cont = vm is not None and vm.get(W + "val") in (None, "continue")
                text = " ".join("".join(t.text or "" for t in p.iter(W + "t")) for p in tc.iter(W + "p"))
                row.append("" if vmerge_cont else text)
                row.extend([""] * (span - 1))
            rows.append(row)
        rows = tidy(rows, "lined")
        if rows:
            n = len(tables) + 1
            tables.append((f"Word table {n}", f"W{n}", rows))
            if len(tables) >= MAX_TABLES:
                break
    return tables


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self.depth = 0
        self.rows: list | None = None
        self.row: list | None = None
        self.cell: list | None = None
        self.span = 1
        self.skip = 0

    def _flush_cell(self) -> None:
        if self.cell is not None and self.row is not None:
            self.row.append("".join(self.cell))
            self.row.extend([""] * (self.span - 1))
        self.cell = None

    def _flush_row(self) -> None:
        self._flush_cell()
        if self.row is not None and self.rows is not None:
            self.rows.append(self.row)
        self.row = None

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag == "table":
            self.depth += 1
            if self.depth == 1:
                self.rows = []
        elif self.depth == 1:
            if tag == "tr":
                self._flush_row()
                self.row = []
            elif tag in ("td", "th") and self.row is not None:
                self._flush_cell()
                self.cell = []
                try:
                    self.span = max(1, min(int(dict(attrs).get("colspan") or 1), 50))
                except ValueError:
                    self.span = 1
            elif tag == "br" and self.cell is not None:
                self.cell.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        elif tag == "table":
            if self.depth == 1 and self.rows is not None:
                self._flush_row()
                self.tables.append(self.rows)
                self.rows = None
            self.depth = max(0, self.depth - 1)
        elif self.depth == 1:
            if tag == "tr":
                self._flush_row()
            elif tag in ("td", "th"):
                self._flush_cell()

    def handle_data(self, data):
        if self.cell is not None and not self.skip:
            self.cell.append(data)


def extract_html(path: str):
    with open(path, "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    parser = _TableParser()
    parser.feed(text)
    parser.close()
    tables = []
    for rows in parser.tables:
        rows = tidy(rows, "lined")
        if rows:
            n = len(tables) + 1
            tables.append((f"Web table {n}", f"H{n}", rows))
            if len(tables) >= MAX_TABLES:
                break
    return tables


# ---------------------------------------------------------------- result for Data Studio
def to_result(path: str, tables, numbers: bool, scanned: bool, truncated: bool) -> dict:
    out, total, used = [], 0, set()
    for title, sheet_name, rows in tables:
        cells, widths = [], {}
        for r, row in enumerate(rows):
            for c, v in enumerate(row):
                if v is None:
                    continue
                cells.append([r, c, smart_number(v) if (numbers and r > 0) else v, "", 0 if r == 0 else -1])
                widths[c] = max(widths.get(c, 0), len(v))
        total += len(cells)
        if total > MAX_CELLS:
            raise TableError(f"Too many cells (over {MAX_CELLS:,}). Try a smaller file.")
        name, n = sheet_name[:31], 2
        while name.lower() in used:
            name, n = f"{sheet_name[:27]} ({n})", n + 1
        used.add(name.lower())
        out.append({
            "title": title, "rows": len(rows), "cols": len(rows[0]),
            "preview": " | ".join((x or "")[:14] for x in rows[0][:4])[:60],
            "sheet": {"name": name, "cells": cells, "styles": [{"bl": 1}], "merges": [],
                      "cols": [[c, max(60, min(360, w * 8 + 16))] for c, w in widths.items()]},
        })
    return {"ok": True, "op": "tables", "name": os.path.splitext(os.path.basename(path))[0],
            "tables": out, "scanned": bool(scanned and not out), "truncated": truncated}


def extract(path: str, mode: str, numbers: bool, progress) -> dict:
    ext = os.path.splitext(path)[1].lower()
    scanned = truncated = False
    if ext == ".pdf":
        tables, scanned, truncated = extract_pdf(path, mode, progress)
    elif ext == ".docx":
        tables = extract_docx(path)
    elif ext in (".html", ".htm"):
        tables = extract_html(path)
    else:
        raise TableError("This file type is not supported. Use PDF, DOCX or HTML.")
    return to_result(path, tables, numbers, scanned, truncated)


# ---------------------------------------------------------------- service
class TableService(QObject):
    done = Signal(dict)
    step = Signal(str)

    def __init__(self, toast, send, parent=None) -> None:
        super().__init__(parent)
        self.toast = toast
        self.send = send
        self.busy = False
        self.last_dir = os.path.join(os.path.expanduser("~"), "Documents")
        self.done.connect(self.on_done)
        self.step.connect(lambda m: self.toast(m, "warn"))

    def handle(self, req: dict, parent) -> None:
        if self.busy:
            return self.toast("Another table search is still running. Please wait.", "warn")
        mode = "text" if req.get("mode") == "text" else "lined"
        numbers = req.get("numbers") is not False
        path, _ = QFileDialog.getOpenFileName(parent, "Choose a file with tables", self.last_dir,
                                              "Files with tables (*.pdf *.docx *.html *.htm)")
        if not path:
            return self.toast("Cancelled", "warn")
        self.last_dir = os.path.dirname(path)
        try:
            if os.path.getsize(path) > MAX_FILE_BYTES:
                return self.toast("This file is too large (over 80 MB)", "error")
        except OSError:
            return self.toast("Could not read the file", "error")
        self.busy = True
        self.toast("Looking for tables…", "warn")
        threading.Thread(target=self._work, args=(path, mode, numbers), daemon=True).start()

    def _work(self, path: str, mode: str, numbers: bool) -> None:
        try:
            self.done.emit(extract(path, mode, numbers, self.step.emit))
        except TableError as e:
            self.done.emit({"ok": False, "error": str(e)})
        except ImportError:
            self.done.emit({"ok": False, "error": "pdfplumber is missing. Run: pip install pdfplumber"})
        except MemoryError:
            self.done.emit({"ok": False, "error": "This file is too large for the memory available"})
        except Exception:  # noqa: BLE001
            log.exception("table search failed")
            self.done.emit({"ok": False, "error": "Could not finish. Details are in equation_studio.log"})

    def on_done(self, res: dict) -> None:
        self.busy = False
        if not res.get("ok"):
            return self.toast(res.get("error", "Could not finish"), "error")
        n = len(res["tables"])
        if n:
            self.toast(f"Found {n} table{'s' if n != 1 else ''}", "success")
        self.send(res)