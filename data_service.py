# 📁 FILE: D:\EquationTool\data_service.py
"""Data Studio files (Phase B1): open .xlsx / .csv / .json, save .xlsx / .csv / .json, autosave and restore.
Cells travel as [row, column, value, formula, style index] lists (zero-based) with a style table per sheet.
Kept: values, formulas, sheet names, dates and number formats, merged cells, column widths, bold, italic,
fill and font colour, alignment. Not kept yet: borders, fonts and sizes, conditional formats, images, charts."""
from __future__ import annotations

import csv
import json
import logging
import math
import os
import re
from datetime import date, datetime, time
from decimal import Decimal

from PySide6.QtCore import QObject
from PySide6.QtWidgets import QFileDialog

from table_extract import TableService

log = logging.getLogger("EquationStudio.data")

MAX_FILE_BYTES = 40 * 1024 * 1024
MAX_AUTOSAVE_BYTES = 30 * 1024 * 1024
MAX_CELLS = 300_000
MAX_SHEETS = 30
MAX_ROWS = 1_048_576
MAX_COLS = 16_384
MAX_READ_ROWS = 200_000
MAX_FORMULA = 8000
MAX_MERGES = 5000
MAX_MERGE_AREA = 100_000
MAX_STYLES = 500
MAX_COL_WIDTHS = 2000
CSV_GRID_LIMIT = 20_000_000
JSON_MAX_RECORDS = 100_000
JSON_MAX_COLUMNS = 200
BAD_DATA = "The sheet data was not valid"
NUM_RX = re.compile(r"^-?(0|[1-9]\d*)(\.\d+)?$")
BAD_SHEET_CHARS = re.compile(r"[\[\]:*?/\\]")
BAD_FILE_CHARS = re.compile(r'[\\/:*?"<>|\r\n\t]+')
HEX_RX = re.compile(r"^#[0-9a-fA-F]{6}$")
ALIGN = {"left": 1, "center": 2, "right": 3}
ALIGN_NAME = {1: "left", 2: "center", 3: "right"}


class DataError(Exception):
    """A problem the user can understand; its text is shown as-is."""


# ---------------------------------------------------------------- value helpers
def json_value(v):
    if v is None or isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v if not isinstance(v, float) or math.isfinite(v) else None
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, datetime):
        return v.isoformat(sep=" ")
    if isinstance(v, (date, time)):
        return v.isoformat()
    return str(v)


def excel_value(v):
    """Dates become Excel serial numbers (shown as dates through the number format)."""
    if isinstance(v, (datetime, date, time)):
        from openpyxl.utils.datetime import to_excel

        try:
            return float(to_excel(v))
        except Exception:  # noqa: BLE001
            return v.isoformat()
    return json_value(v)


def looks_date(pattern: str) -> bool:
    p = re.sub(r"\[[^\]]*\]|\"[^\"]*\"", "", pattern.lower())
    return bool(re.search(r"[ymdhs]", p)) and not re.search(r"[#0?]", p)


def display_value(v, st):
    """Value as text-friendly data for CSV / JSON (date cells become date strings)."""
    if v is None or isinstance(v, (bool, str)):
        return v
    pattern = st.get("n") if st else None
    if pattern and looks_date(pattern):
        try:
            from openpyxl.utils.datetime import from_excel

            d = from_excel(v)
            if isinstance(d, datetime):
                return d.date().isoformat() if d.time() == time(0, 0) else d.isoformat(sep=" ")
            return str(d)
        except Exception:  # noqa: BLE001
            pass
    return v


# ---------------------------------------------------------------- reading files
def cell_style(cell) -> dict:
    st: dict = {}
    try:
        f = cell.font
        if f is not None:
            if f.b:
                st["bl"] = 1
            if f.i:
                st["it"] = 1
            c = f.color
            if c is not None and c.type == "rgb" and isinstance(c.rgb, str) and len(c.rgb) >= 6:
                h = "#" + c.rgb[-6:]
                if h.upper() != "#000000":
                    st["cl"] = h
        fl = cell.fill
        if fl is not None and fl.fill_type == "solid":
            fg = fl.fgColor
            if fg is not None and fg.type == "rgb" and isinstance(fg.rgb, str) and len(fg.rgb) >= 6:
                st["bg"] = "#" + fg.rgb[-6:]
        al = cell.alignment.horizontal if cell.alignment is not None else None
        if al in ALIGN:
            st["ht"] = ALIGN[al]
        nf = cell.number_format
        if nf and nf != "General":
            st["n"] = str(nf)[:100]
    except Exception:  # noqa: BLE001
        pass
    return st


def read_col_widths(ws) -> list[list[int]]:
    from openpyxl.utils import column_index_from_string

    out: dict[int, int] = {}
    for key, dim in ws.column_dimensions.items():
        w = getattr(dim, "width", None)
        if not w or getattr(dim, "hidden", False):
            continue
        try:
            lo = dim.min or column_index_from_string(key)
            hi = dim.max or lo
        except Exception:  # noqa: BLE001
            continue
        px = max(30, min(800, int(w * 7 + 5)))
        for c in range(lo - 1, min(hi, lo + 100)):
            out[c] = px
            if len(out) >= MAX_COL_WIDTHS:
                return [[k, v] for k, v in out.items()]
    return [[k, v] for k, v in out.items()]


def read_xlsx(path: str) -> list[dict]:
    from openpyxl import load_workbook

    wf = wv = None
    try:
        try:
            wf = load_workbook(path, data_only=False)
            wv = load_workbook(path, data_only=True)
        except Exception as e:  # noqa: BLE001
            log.info("xlsx read failed: %s", e)
            raise DataError(f"{os.path.basename(path)} is not a valid Excel file or is damaged") from e
        sheets, total = [], 0
        for ws in wf.worksheets[:MAX_SHEETS]:
            if not hasattr(ws, "iter_rows"):
                continue
            wsv = wv[ws.title]
            styles: list[dict] = []
            index: dict[str, int] = {}
            cells = []
            for row in ws.iter_rows(max_row=min(ws.max_row or 1, MAX_READ_ROWS)):
                for cell in row:
                    cf = cell.value
                    if cf is None:
                        continue
                    formula = ""
                    if isinstance(cf, str) and cf.startswith("="):
                        formula = cf
                    elif hasattr(cf, "text"):  # array formula
                        formula = "=" + str(cf.text).lstrip("=")
                    if formula:
                        value = excel_value(wsv.cell(row=cell.row, column=cell.column).value)
                    else:
                        value = excel_value(cf)
                    st = cell_style(cell)
                    if isinstance(cf, (datetime, date, time)) and "n" not in st:
                        if isinstance(cf, time):
                            st["n"] = "hh:mm:ss"
                        elif isinstance(cf, datetime) and (cf.hour or cf.minute or cf.second):
                            st["n"] = "yyyy-mm-dd hh:mm"
                        else:
                            st["n"] = "yyyy-mm-dd"
                    si = -1
                    if st:
                        key = json.dumps(st, sort_keys=True)
                        si = index.get(key, -1)
                        if si < 0 and len(styles) < MAX_STYLES:
                            si = index[key] = len(styles)
                            styles.append(st)
                    cells.append([cell.row - 1, cell.column - 1, value, formula[:MAX_FORMULA], si])
                    total += 1
                    if total > MAX_CELLS:
                        raise DataError(f"This file is too large for now (over {MAX_CELLS:,} cells)")
            merges = [[m.min_row - 1, m.min_col - 1, m.max_row - 1, m.max_col - 1] for m in ws.merged_cells.ranges][:MAX_MERGES]
            sheets.append({"name": ws.title, "cells": cells, "styles": styles, "merges": merges, "cols": read_col_widths(ws)})
        if not sheets:
            raise DataError("This file has no sheets with data")
        return sheets
    finally:
        for wb in (wf, wv):
            try:
                if wb is not None:
                    wb.close()
            except Exception:  # noqa: BLE001
                pass


def read_csv(path: str) -> list[dict]:
    with open(path, "rb") as fh:
        raw = fh.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    cells, total = [], 0
    for r, row in enumerate(csv.reader(text.splitlines(), dialect)):
        for c, val in enumerate(row):
            s = val.strip()
            if not s:
                continue
            v = (float(s) if "." in s else int(s)) if NUM_RX.match(s) else val
            cells.append([r, c, v, "", -1])
            total += 1
            if total > MAX_CELLS:
                raise DataError(f"This file is too large for now (over {MAX_CELLS:,} cells)")
    if not cells:
        raise DataError("This file is empty")
    stem = os.path.splitext(os.path.basename(path))[0][:31] or "Sheet1"
    return [{"name": BAD_SHEET_CHARS.sub(" ", stem), "cells": cells, "styles": [], "merges": [], "cols": []}]


def read_json(path: str) -> list[dict]:
    with open(path, "rb") as fh:
        raw = fh.read()
    try:
        data = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError) as e:
        raise DataError(f"{os.path.basename(path)} is not valid JSON") from e
    if isinstance(data, dict):  # {"data": [...]} style wrappers
        lists = [v for v in data.values() if isinstance(v, list) and v]
        data = lists[0] if lists else [data]
    if not isinstance(data, list) or not data:
        raise DataError("The JSON file must contain a list of records")

    def scalar(v):
        if v is None or isinstance(v, (bool, str)):
            return v
        if isinstance(v, (int, float)):
            return v if not isinstance(v, float) or math.isfinite(v) else None
        return json.dumps(v, ensure_ascii=False)[:32000]

    cells, total = [], 0
    styles: list[dict] = []
    if all(isinstance(x, dict) for x in data[:50]):
        headers: list[str] = []
        seen: set[str] = set()
        records = data[:JSON_MAX_RECORDS]
        for rec in records:
            if isinstance(rec, dict):
                for k in rec:
                    if k not in seen and len(headers) < JSON_MAX_COLUMNS:
                        seen.add(k)
                        headers.append(str(k))
        styles = [{"bl": 1}]
        for c, h in enumerate(headers):
            cells.append([0, c, h, "", 0])
        for r, rec in enumerate(records, start=1):
            if not isinstance(rec, dict):
                continue
            for c, h in enumerate(headers):
                v = scalar(rec.get(h))
                if v is None:
                    continue
                cells.append([r, c, v, "", -1])
                total += 1
                if total > MAX_CELLS:
                    raise DataError(f"This file is too large for now (over {MAX_CELLS:,} cells)")
    else:
        for r, row in enumerate(data[:JSON_MAX_RECORDS]):
            items = row if isinstance(row, list) else [row]
            for c, v in enumerate(items[:JSON_MAX_COLUMNS]):
                v = scalar(v)
                if v is None:
                    continue
                cells.append([r, c, v, "", -1])
                total += 1
                if total > MAX_CELLS:
                    raise DataError(f"This file is too large for now (over {MAX_CELLS:,} cells)")
    if not cells:
        raise DataError("This file has no data")
    stem = os.path.splitext(os.path.basename(path))[0][:31] or "Sheet1"
    return [{"name": BAD_SHEET_CHARS.sub(" ", stem), "cells": cells, "styles": styles, "merges": [], "cols": []}]


# ---------------------------------------------------------------- checking data that comes from the page
def check_style(st) -> dict:
    if not isinstance(st, dict):
        raise DataError(BAD_DATA)
    out: dict = {}
    for k in ("bl", "it"):
        if st.get(k) in (1, True):
            out[k] = 1
    for k in ("bg", "cl"):
        v = st.get(k)
        if isinstance(v, str) and HEX_RX.match(v):
            out[k] = v
    if st.get("ht") in (1, 2, 3):
        out["ht"] = int(st["ht"])
    n = st.get("n")
    if isinstance(n, str) and 0 < len(n) <= 100:
        out["n"] = n
    return out


def check_sheets(raw) -> list[dict]:
    if not isinstance(raw, list) or not raw or len(raw) > MAX_SHEETS:
        raise DataError(BAD_DATA)
    out, total = [], 0
    for s in raw:
        if not isinstance(s, dict) or not isinstance(s.get("cells"), list):
            raise DataError(BAD_DATA)
        raw_styles = s.get("styles") if isinstance(s.get("styles"), list) else []
        styles = [check_style(x) for x in raw_styles[:MAX_STYLES]]
        cells = []
        for item in s["cells"]:
            if not isinstance(item, list) or len(item) not in (4, 5):
                raise DataError(BAD_DATA)
            r, c, v, f = item[:4]
            si = item[4] if len(item) == 5 else -1
            if not (isinstance(r, int) and isinstance(c, int) and 0 <= r < MAX_ROWS and 0 <= c < MAX_COLS):
                raise DataError("A cell is outside the allowed sheet size")
            if not (v is None or isinstance(v, (bool, int, float, str))) or not isinstance(f, str) or len(f) > MAX_FORMULA:
                raise DataError(BAD_DATA)
            if isinstance(v, float) and not math.isfinite(v):
                v = None
            if not (isinstance(si, int) and -1 <= si < len(styles)):
                si = -1
            cells.append((r, c, v, f, si))
        total += len(cells)
        if total > MAX_CELLS:
            raise DataError(f"Too many cells to save (maximum {MAX_CELLS:,})")
        merges = []
        for m in (s.get("merges") if isinstance(s.get("merges"), list) else [])[:MAX_MERGES]:
            if (isinstance(m, list) and len(m) == 4 and all(isinstance(x, int) for x in m)
                    and 0 <= m[0] <= m[2] < MAX_ROWS and 0 <= m[1] <= m[3] < MAX_COLS
                    and (m[2] - m[0] + 1) * (m[3] - m[1] + 1) <= MAX_MERGE_AREA):
                merges.append(tuple(m))
        cols = []
        for w in (s.get("cols") if isinstance(s.get("cols"), list) else [])[:MAX_COL_WIDTHS]:
            if (isinstance(w, list) and len(w) == 2 and all(isinstance(x, (int, float)) for x in w)
                    and 0 <= w[0] < MAX_COLS and 20 <= w[1] <= 2000):
                cols.append((int(w[0]), float(w[1])))
        out.append({"name": str(s.get("name") or "Sheet"), "cells": cells, "styles": styles, "merges": merges, "cols": cols})
    return out


def unique_title(name: str, used: set[str]) -> str:
    base = (BAD_SHEET_CHARS.sub(" ", name).strip("' ") or "Sheet")[:31]
    title, n = base, 2
    while title.lower() in used:
        suffix = f" ({n})"
        title = base[: 31 - len(suffix)] + suffix
        n += 1
    used.add(title.lower())
    return title


def get_fmt(wb, cache: dict, st):
    if not st:
        return None
    key = json.dumps(st, sort_keys=True)
    fmt = cache.get(key)
    if fmt is None:
        props: dict = {}
        if st.get("bl"):
            props["bold"] = True
        if st.get("it"):
            props["italic"] = True
        if st.get("bg"):
            props["bg_color"] = st["bg"]
        if st.get("cl"):
            props["font_color"] = st["cl"]
        if st.get("ht"):
            props["align"] = ALIGN_NAME[st["ht"]]
        if st.get("n"):
            props["num_format"] = st["n"]
        fmt = cache[key] = wb.add_format(props)
    return fmt


def put(ws, r: int, c: int, v, f: str, fmt) -> None:
    if f:
        ws.write_formula(r, c, f, fmt, "" if v is None else v)
    elif isinstance(v, bool):
        ws.write_boolean(r, c, v, fmt)
    elif isinstance(v, (int, float)):
        ws.write_number(r, c, v, fmt)
    elif isinstance(v, str):
        ws.write_string(r, c, v[:32767], fmt)
    elif fmt is not None:
        ws.write_blank(r, c, None, fmt)


def sheet_grid(sheet: dict):
    styles = sheet["styles"]
    grid: dict[int, dict[int, object]] = {}
    rows = cols = 0
    for r, c, v, _f, si in sheet["cells"]:
        if v is None:
            continue
        grid.setdefault(r, {})[c] = display_value(v, styles[si] if si >= 0 else None)
        rows, cols = max(rows, r + 1), max(cols, c + 1)
    return grid, rows, cols


# ---------------------------------------------------------------- service
class DataService(QObject):
    def __init__(self, toast, send, data_dir: str, parent=None) -> None:
        super().__init__(parent)
        self.toast = toast
        self.send = send
        self.autosave_path = os.path.join(data_dir, "data_autosave.json")
        self.tables = TableService(toast, send, self)
        self.last_dir = os.path.join(os.path.expanduser("~"), "Documents")
        self._warned = False

    def handle(self, req: dict, parent) -> None:
        op = req.get("op")
        if op == "autosave":
            return self.autosave(req)
        if op == "restore":
            return self.restore()
        if op == "tables":
            return self.tables.handle(req, parent)
        try:
            if op == "open":
                self.open_file(parent)
            elif op == "save-xlsx":
                self.save_xlsx(req, parent)
            elif op == "save-csv":
                self.save_csv(req, parent)
            elif op == "save-json":
                self.save_json(req, parent)
            else:
                log.warning("Ignored unknown data request: %r", op)
        except DataError as e:
            self.toast(str(e), "error")
        except ImportError:
            self.toast("A spreadsheet library is missing. Run: pip install openpyxl XlsxWriter", "error")
        except Exception:  # noqa: BLE001
            log.exception("Data Studio request failed")
            self.toast("Could not finish. Details are in equation_studio.log", "error")

    # ---------- autosave / restore ----------
    def autosave(self, req: dict) -> None:
        try:
            raw = req.get("json")
            if not isinstance(raw, str) or not raw or len(raw) > MAX_AUTOSAVE_BYTES:
                return
            obj = json.loads(raw)
            if not (isinstance(obj, dict) and isinstance(obj.get("sheets"), dict)):
                return
            part = self.autosave_path + ".part"
            try:
                with open(part, "w", encoding="utf-8") as f:
                    f.write(raw)
                os.replace(part, self.autosave_path)
            except OSError:
                self._drop(part)
                raise
        except Exception:  # noqa: BLE001
            log.exception("autosave failed")
            if not self._warned:
                self._warned = True
                self.toast("The sheet could not be autosaved. Save it as .xlsx to be safe.", "warn")

    def restore(self) -> None:
        p = self.autosave_path
        try:
            if not os.path.isfile(p) or os.path.getsize(p) > MAX_AUTOSAVE_BYTES:
                return
            with open(p, "r", encoding="utf-8") as f:
                obj = json.load(f)
        except (OSError, ValueError):
            log.warning("the autosaved sheet could not be read")
            return
        if isinstance(obj, dict) and isinstance(obj.get("sheets"), dict) and obj["sheets"]:
            self.send({"ok": True, "op": "restore", "snapshot": obj})

    # ---------- open ----------
    def open_file(self, parent) -> None:
        path, _ = QFileDialog.getOpenFileName(parent, "Open a file", self.last_dir,
                                              "Spreadsheets and data (*.xlsx *.xlsm *.csv *.tsv *.txt *.json)")
        if not path:
            return self.toast("Cancelled", "warn")
        self.last_dir = os.path.dirname(path)
        if os.path.getsize(path) > MAX_FILE_BYTES:
            raise DataError("This file is too large (over 40 MB)")
        ext = os.path.splitext(path)[1].lower()
        if ext in (".xlsx", ".xlsm"):
            sheets = read_xlsx(path)
        elif ext == ".json":
            sheets = read_json(path)
        else:
            sheets = read_csv(path)
        self.send({"ok": True, "op": "open", "name": os.path.splitext(os.path.basename(path))[0], "sheets": sheets})
        self.toast("Opened: " + os.path.basename(path))

    # ---------- save ----------
    def ask_target(self, parent, req: dict, ext: str, title: str, flt: str) -> str | None:
        name = req.get("name") if isinstance(req.get("name"), str) else ""
        base = BAD_FILE_CHARS.sub(" ", name).strip(" .")[:80] or "spreadsheet"
        out, _ = QFileDialog.getSaveFileName(parent, title, os.path.join(self.last_dir, f"{base}.{ext}"), flt)
        if not out:
            return None
        self.last_dir = os.path.dirname(out)
        return out if out.lower().endswith("." + ext) else out + "." + ext

    def save_xlsx(self, req: dict, parent) -> None:
        sheets = check_sheets(req.get("sheets"))
        out = self.ask_target(parent, req, "xlsx", "Save as an Excel file", "Excel workbook (*.xlsx)")
        if not out:
            return self.toast("Save cancelled", "warn")
        import xlsxwriter

        part = out + ".part"
        try:
            wb = xlsxwriter.Workbook(part, {"strings_to_numbers": False, "strings_to_formulas": False,
                                            "strings_to_urls": False, "nan_inf_to_errors": True})
            cache: dict = {}
            used: set[str] = set()
            for s in sheets:
                ws = wb.add_worksheet(unique_title(s["name"], used))
                styles = s["styles"]
                cellmap = {(r, c): (v, f, si) for r, c, v, f, si in s["cells"]}
                skip: set[tuple[int, int]] = set()
                for r1, c1, r2, c2 in s["merges"]:
                    v, f, si = cellmap.get((r1, c1), (None, "", -1))
                    try:
                        ws.merge_range(r1, c1, r2, c2, "", get_fmt(wb, cache, styles[si] if si >= 0 else None))
                    except Exception:  # noqa: BLE001
                        continue
                    for rr in range(r1, r2 + 1):
                        for cc in range(c1, c2 + 1):
                            if (rr, cc) != (r1, c1):
                                skip.add((rr, cc))
                for r, c, v, f, si in s["cells"]:
                    if (r, c) not in skip:
                        put(ws, r, c, v, f, get_fmt(wb, cache, styles[si] if si >= 0 else None))
                for c, px in s["cols"]:
                    ws.set_column(c, c, max(1.0, (px - 5) / 7.0))
            wb.close()
            os.replace(part, out)
        except PermissionError as e:
            self._drop(part)
            raise DataError("Could not save. If that file is open in Excel, close it and try again.") from e
        except Exception as e:  # noqa: BLE001
            self._drop(part)
            log.exception("xlsx save failed")
            raise DataError("Could not save the Excel file. Details are in equation_studio.log") from e
        self.toast(f"Saved: {os.path.basename(out)} ({len(sheets)} sheet{'s' if len(sheets) != 1 else ''})")

    def pick_sheet(self, req: dict) -> dict:
        sheets = check_sheets(req.get("sheets"))
        active = req.get("active") if isinstance(req.get("active"), int) else 0
        return sheets[active if 0 <= active < len(sheets) else 0]

    def save_csv(self, req: dict, parent) -> None:
        sheet = self.pick_sheet(req)
        grid, rows, cols = sheet_grid(sheet)
        if not rows:
            raise DataError("This sheet is empty")
        if rows * cols > CSV_GRID_LIMIT:
            raise DataError("This sheet is too spread out to save as CSV")
        out = self.ask_target(parent, req, "csv", "Save as a CSV file", "CSV file (*.csv)")
        if not out:
            return self.toast("Save cancelled", "warn")

        def text(v) -> str:
            if v is None:
                return ""
            if isinstance(v, bool):
                return "TRUE" if v else "FALSE"
            return "%.15g" % v if isinstance(v, float) else str(v)

        part = out + ".part"
        try:
            with open(part, "w", encoding="utf-8-sig", newline="") as f:
                w = csv.writer(f)
                for r in range(rows):
                    row = grid.get(r, {})
                    w.writerow([text(row.get(c)) for c in range(cols)])
            os.replace(part, out)
        except PermissionError as e:
            self._drop(part)
            raise DataError("Could not save. If that file is open in another program, close it and try again.") from e
        except OSError as e:
            self._drop(part)
            raise DataError("Could not save the file (disk full or folder not writable)") from e
        self.toast(f"Saved: {os.path.basename(out)} (sheet “{sheet['name']}”)")

    def save_json(self, req: dict, parent) -> None:
        sheet = self.pick_sheet(req)
        grid, rows, cols = sheet_grid(sheet)
        if not rows:
            raise DataError("This sheet is empty")
        if rows * cols > CSV_GRID_LIMIT:
            raise DataError("This sheet is too spread out to save as JSON")
        out = self.ask_target(parent, req, "json", "Save as a JSON file", "JSON file (*.json)")
        if not out:
            return self.toast("Save cancelled", "warn")

        def jv(v):
            if isinstance(v, float) and v.is_integer() and abs(v) < 1e15:
                return int(v)
            return v

        header = grid.get(0, {})
        as_objects = rows > 1 and bool(header) and all(isinstance(x, str) and x.strip() for x in header.values())
        if as_objects:
            keys, seen = [], set()
            for c in range(cols):
                k = str(header.get(c) or f"column_{c + 1}").strip()
                base, n = k, 2
                while k in seen:
                    k, n = f"{base}_{n}", n + 1
                seen.add(k)
                keys.append(k)
            data = [{keys[c]: jv(grid.get(r, {}).get(c)) for c in range(cols)} for r in range(1, rows)]
        else:
            data = [[jv(grid.get(r, {}).get(c)) for c in range(cols)] for r in range(rows)]
        part = out + ".part"
        try:
            with open(part, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(part, out)
        except PermissionError as e:
            self._drop(part)
            raise DataError("Could not save. If that file is open in another program, close it and try again.") from e
        except (OSError, ValueError, TypeError) as e:
            self._drop(part)
            raise DataError("Could not save the file (disk full or folder not writable)") from e
        self.toast(f"Saved: {os.path.basename(out)} ({len(data)} {'records' if as_objects else 'rows'})")

    @staticmethod
    def _drop(path: str) -> None:
        try:
            os.remove(path)
        except OSError:
            pass