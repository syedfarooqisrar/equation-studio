/* 📁 FILE: assets/data-studio.js
   Data Studio (editor side): overlay, ribbon buttons, and the bridge between the spreadsheet iframe and Python.
   iframe -> here (postMessage) -> Python (window.pyDataRequest, one request at a time)
   Python -> here (window.onDataResult) -> iframe */
'use strict';
(function () {
  const box = $('#dataStudio'), frame = $('#dsFrame'), status = $('#dsStatus');
  if (!box || !frame) return;
  const START_TIMEOUT_MS = 25000;
  let started = false, ready = false, timer = 0;
  const postQ = [], readyQ = [], pyQ = [];

  const setStatus = t => { status.textContent = t || ''; status.title = t || ''; };
  const send = m => { if (frame.contentWindow) frame.contentWindow.postMessage(m, '*'); };
  const post = m => { if (ready) send(m); else postQ.push(m); };

  /* Python reads one request every ~300 ms; this queue stops a second request from overwriting the first */
  function pump() {
    if (window.pyDataRequest) { setTimeout(pump, 150); return; }
    const next = pyQ.shift();
    if (!next) return;
    window.pyDataRequest = JSON.stringify(next);
    if (pyQ.length) setTimeout(pump, 150);
  }
  function toPython(o) {
    if (o.op === 'autosave') { for (let i = pyQ.length - 1; i >= 0; i--) if (pyQ[i].op === 'autosave') pyQ.splice(i, 1); }
    pyQ.push(o);
    pump();
  }

  function open() {
    box.classList.add('open');
    if (started) return;
    started = true;
    setStatus('Starting the spreadsheet…');
    timer = setTimeout(() => {
      if (!ready) { setStatus('The spreadsheet did not start'); showToast('The spreadsheet did not start. Details are in equation_studio.log', 'error'); }
    }, START_TIMEOUT_MS);
    frame.src = 'assets/data-studio.html';
  }
  const close = () => { post({ type: 'flush' }); box.classList.remove('open'); };
  const whenReady = fn => { open(); if (ready) fn(); else readyQ.push(fn); };
  const exportAs = kind => whenReady(() => post({ type: 'export', kind }));
  const openFile = () => whenReady(() => toPython({ op: 'open' }));

  window.addEventListener('message', e => {
    if (e.source !== frame.contentWindow || !e.data || typeof e.data.type !== 'string') return;
    const m = e.data;
    if (m.type === 'ready') {
      ready = true; clearTimeout(timer); setStatus('Ready');
      postQ.splice(0).forEach(send);
      toPython({ op: 'restore' });                       // bring back the last sheet, if there is one
      readyQ.splice(0).forEach(fn => fn());
    } else if (m.type === 'fatal') {
      clearTimeout(timer); setStatus('The spreadsheet could not start'); showToast(m.message, 'error');
    } else if (m.type === 'status') setStatus(m.text);
    else if (m.type === 'problem') showToast(m.message || 'Something went wrong', 'error');
    else if (m.type === 'autosave') toPython({ op: 'autosave', json: m.json });
    else if (m.type === 'range') rangeToDocument(m);
    else if (m.type === 'exported') {
      if (!m.sheets || !m.sheets.length) return showToast('Nothing to save yet', 'warn');
      toPython({ op: 'save-' + m.kind, name: m.name, active: m.active, sheets: m.sheets });
    }
  });

  /* Python answers "open" and "restore" */
  window.onDataResult = res => {
    if (!res) return;
    if (res.ok === false) return showToast(res.error || 'Could not open the file', 'error');
    if (res.op === 'restore' && res.snapshot) post({ type: 'load-snapshot', snapshot: res.snapshot });
    else if (res.op === 'open') post({ type: 'load', res });
    else if (res.op === 'tables') chooseTables(res);
  };

  const bind = (id, fn) => { const b = document.getElementById(id); if (b) on(b, 'click', fn); };
  bind('toolDataStudio', open);
  bind('dtStudio', open);
  bind('dtOpen', openFile);
  bind('dtX', () => exportAs('xlsx'));
  bind('dtC', () => exportAs('csv'));
  bind('dtJ', () => exportAs('json'));

  /* Tables from a PDF / Word / web page: options -> Python finds them -> you tick the ones you want */
  function startTables() {
    eqUI.form('Tables from a file', [
      { id: 'mode', label: 'Tables in a PDF look like', type: 'select', value: 'lined',
        options: [['lined', 'Boxes or lines around the cells (most reports)'], ['text', 'No lines, columns line up by spacing']],
        hint: 'Word and web page files do not need this.' },
      { id: 'numbers', label: 'Turn numbers like 1,234 and (500) and ۱۲۳ into real numbers', type: 'checkbox', value: true }
    ], v => {
      toPython({ op: 'tables', mode: v.mode, numbers: !!v.numbers });
    }, { width: '460px', okText: 'Choose file…' });
  }
  function chooseTables(res) {
    const tabs = res.tables || [];
    if (!tabs.length) {
      return showToast(res.scanned ? 'No text found. This looks like a scanned file: use Tools → Scanned PDF first.' : 'No tables were found in this file.', 'warn');
    }
    close();                                            // the dialog must not hide behind the spreadsheet
    const shown = tabs.slice(0, 30);
    if (tabs.length > shown.length || res.truncated) showToast('Showing the first ' + shown.length + ' tables.', 'warn');
    const fields = shown.map((t, i) => ({
      id: 't' + i, type: 'checkbox', value: i < 10,
      label: t.title + '  (' + t.rows + ' rows × ' + t.cols + ' columns)  ' + (t.preview ? '“' + t.preview + '”' : '')
    }));
    fields.unshift({ id: 'how', label: 'Put them in the spreadsheet', type: 'select', value: 'append',
      options: [['append', 'as new sheets'], ['replace', 'in place of the current sheet']] });
    eqUI.form('Tables found: ' + tabs.length, fields, v => {
      const pick = shown.filter((t, i) => v['t' + i]);
      if (!pick.length) { showToast('Tick at least one table', 'warn'); return false; }
      const payload = { name: res.name, sheets: pick.map(t => t.sheet) };
      const go = () => post({ type: v.how === 'replace' ? 'load' : 'append', res: payload });
      const fresh = !ready;                              // a just-started spreadsheet first restores your last sheet
      whenReady(() => (fresh ? setTimeout(go, 1500) : go()));
    }, { width: '540px', okText: 'Add to spreadsheet' });
  }
  bind('dtTables', startTables);

  /* ============ Document table <-> grid ============ */
  const NUM = /^[-+(]?[\d.,]+%?\)?$/;
  const MAX_DOC_COLS = 15, CHUNK_ROWS = 35;

  function smartNumber(text) {                         // '1,234' -> 1234, '(500)' -> -500, '۱۲۳' -> 123; IDs like 007 stay text
    let t = text.trim()
      .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
      .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
    let neg = false;
    if (t.length > 2 && t[0] === '(' && t[t.length - 1] === ')') { neg = true; t = t.slice(1, -1).trim(); }
    else if (t[0] === '-') { neg = true; t = t.slice(1); }
    else if (t[0] === '+') t = t.slice(1);
    const plain = /^\d+(\.\d+)?$/.test(t), comma = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t);
    if (!plain && !comma) return text;
    const digits = t.replace(/,/g, '');
    if (digits.split('.')[0].length > 15 || (plain && t.length > 1 && t[0] === '0' && t.indexOf('0.') !== 0)) return text;
    const n = Number(digits);
    return neg ? -n : n;
  }

  function textOf(n) {
    if (n.nodeType === 3) return n.data;
    if (n.nodeType !== 1) return '';
    if (n.tagName === 'MATH-FIELD') {
      let l = '';
      try { l = n.getValue('latex'); } catch (e) { l = n.getAttribute('value') || ''; }
      return '\u0001' + l + '\u0002';
    }
    if (n.tagName === 'BR') return ' ';
    return [...n.childNodes].map(textOf).join('');
  }
  function cellValue(cell) {
    const t = textOf(cell).replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
    const only = t.match(/^\u0001([^\u0002]*)\u0002$/);
    if (only) return '$' + only[1] + '$';
    return t.replace(/\u0001/g, '\\(').replace(/\u0002/g, '\\)');
  }

  function tableToSheet(table, name) {
    const occ = [], cells = [], merges = [], widths = {}, rowCount = table.rows.length;
    [...table.rows].forEach((tr, r) => {
      occ[r] = occ[r] || [];
      let c = 0;
      [...tr.cells].forEach(cell => {
        while (occ[r][c]) c++;
        const cs = Math.max(1, Math.min(+cell.getAttribute('colspan') || 1, 50));
        const rs = Math.max(1, Math.min(+cell.getAttribute('rowspan') || 1, rowCount - r));
        for (let i = 0; i < rs; i++) { occ[r + i] = occ[r + i] || []; for (let j = 0; j < cs; j++) occ[r + i][c + j] = true; }
        const raw = cellValue(cell), head = cell.tagName === 'TH';
        if (raw !== '') {
          cells.push([r, c, head ? raw : smartNumber(raw), '', head ? 0 : -1]);
          widths[c] = Math.max(widths[c] || 0, raw.length);
        }
        if (cs > 1 || rs > 1) merges.push([r, c, r + rs - 1, c + cs - 1]);
        c += cs;
      });
    });
    return { name, cells, styles: [{ bl: 1 }], merges,
      cols: Object.keys(widths).map(c => [+c, Math.max(60, Math.min(360, widths[c] * 8 + 16))]) };
  }

  function sendTableToGrid() {
    const td = window.eqCurrentCell && window.eqCurrentCell();
    const table = td && td.closest('table');
    if (!table) return showToast('Click inside a table first', 'warn');
    let sheet;
    try { sheet = tableToSheet(table, 'Doc table ' + ([...doc.querySelectorAll('table')].indexOf(table) + 1)); }
    catch (e) { reportError('table-to-grid', e); return showToast('Could not read this table', 'error'); }
    if (!sheet.cells.length) return showToast('This table is empty', 'warn');
    const payload = { name: 'Document table', sheets: [sheet] };
    const fresh = !ready;                               // a just-started spreadsheet first restores your last sheet
    whenReady(() => (fresh ? setTimeout(() => post({ type: 'append', res: payload }), 1500) : post({ type: 'append', res: payload })));
  }

  function fillCell(cell, v) {
    const m = v.match(/^\$(.+)\$$/);
    if (m && /[\\^_{}]/.test(m[1])) {                    // a whole-cell $...$ that looks like maths becomes an equation
      const mf = document.createElement('math-field');
      mf.setAttribute('value', m[1]);
      cell.appendChild(mf);
      return;
    }
    if (v === '') { cell.innerHTML = '<br>'; return; }
    cell.textContent = v;
    if (NUM.test(v.trim())) cell.style.textAlign = 'right';
  }
  function buildDocTable(rows, cols, header) {
    const t = document.createElement('table');
    t.className = 'eq-table';
    const tb = document.createElement('tbody');
    rows.forEach((row, r) => {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement(header && r === 0 ? 'th' : 'td');
        fillCell(cell, row[c] == null ? '' : String(row[c]));
        tr.appendChild(cell);
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }
  function rangeToDocument(m) {
    const vals = m.values;
    if (!Array.isArray(vals) || !vals.length) return showToast('Select some cells first', 'warn');
    const cols = Math.max(...vals.map(r => r.length));
    if (cols > MAX_DOC_COLS) return showToast('A document table holds at most ' + MAX_DOC_COLS + ' columns. Select fewer columns.', 'warn');
    if (vals.length * cols < 2) return showToast('Select a range of cells first', 'warn');
    const first = vals[0];
    const header = first.some(v => v !== '') && first.every(v => v === '' || !NUM.test(String(v).trim()));
    const body = header ? vals.slice(1) : vals;
    const parts = [];
    if (!body.length) parts.push([first]);
    for (let i = 0; i < body.length; i += CHUNK_ROWS) {
      const chunk = body.slice(i, i + CHUNK_ROWS);
      parts.push(header ? [first].concat(chunk) : chunk);
    }
    close();                                            // show the document first, the table goes where your cursor was
    try {
      const tables = parts.map(rows => buildDocTable(rows, cols, header));
      const tail = eqBlocks.insertBlock(tables[0]);
      tables.slice(1).forEach(t => tail.before(t));
      tables.forEach(t => t.querySelectorAll('math-field').forEach(mf => {
        const v = mf.getAttribute('value');
        setupMathField(mf);
        if (v != null) mf.value = v;
      }));
      afterChange(true);
      eqBlocks.setCaret(tail, false);
      tables[0].scrollIntoView({ block: 'nearest' });
      showToast(tables.length > 1 ? 'Inserted as ' + tables.length + ' tables (long tables are split)' : 'Inserted as a table');
    } catch (e) {
      reportError('range-to-document', e);
      showToast('Could not insert the table', 'error');
    }
  }

  bind('dtFromDoc', sendTableToGrid);
  bind('dsToDoc', () => (ready ? post({ type: 'get-range' }) : showToast('The spreadsheet is still starting', 'warn')));
  (function addTableBarButton() {                       // "→ Grid" on the floating table bar of tables.js
    const tb = document.getElementById('tableBar');
    if (!tb) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'eq-grid-btn primary'; b.textContent = '→ Grid';
    b.title = 'Open this table in Data Studio';
    tb.appendChild(b);
    tb.addEventListener('click', e => {
      if (!e.target.closest('.eq-grid-btn')) return;
      e.stopPropagation();                              // tables.js must not treat it as one of its own actions
      sendTableToGrid();
    }, true);
  })();
  bind('dsBack', close);
  bind('dsOpen', () => (ready ? toPython({ op: 'open' }) : showToast('The spreadsheet is still starting', 'warn')));
  bind('dsSaveX', () => (ready ? post({ type: 'export', kind: 'xlsx' }) : showToast('The spreadsheet is still starting', 'warn')));
  bind('dsSaveC', () => (ready ? post({ type: 'export', kind: 'csv' }) : showToast('The spreadsheet is still starting', 'warn')));
  bind('dsSaveJ', () => (ready ? post({ type: 'export', kind: 'json' }) : showToast('The spreadsheet is still starting', 'warn')));
  bind('dsNew', () => {
    if (!ready) return showToast('The spreadsheet is still starting', 'warn');
    if (window.confirm('Start a new empty sheet? Anything not saved will be lost.')) post({ type: 'new' });
  });
})();