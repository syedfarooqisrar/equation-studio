/* 📁 FILE: assets/tables.js
   Word-style tables: Insert → Table picker (hover grid), Insert Table…, Quick Tables, floating table tools,
   Tab / Shift+Tab, paste from Excel as a table.
   Uses globals from app.js: doc, workspace, root, activeField, savedRange, $, $$, on, bindPanel,
   closeAllDropdowns, afterChange, showToast. Shares helpers with charts.js through window.eqBlocks. */
'use strict';
(function () {
  const GRID_COLS = 10, GRID_ROWS = 8, MAX_ROWS = 60, MAX_COLS = 15;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';
  const CHART = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>';

  /* ============ helpers shared with charts.js ============ */
  function blockAtCaret() {
    const sel = getSelection();
    let n = (sel.rangeCount && doc.contains(sel.anchorNode)) ? sel.anchorNode : null;
    if (!n && savedRange && doc.contains(savedRange.startContainer)) n = savedRange.startContainer;
    if (!n && activeField && doc.contains(activeField)) n = activeField;
    while (n && n.parentNode !== doc) n = n.parentNode;
    return n || null;
  }
  function isEmptyPara(b) {
    return !!b && b.tagName === 'P' && !b.querySelector('math-field,img,table,.eq-chart') &&
           !(b.textContent || '').replace(/\u200B/g, '').trim();
  }
  /* put a block after the line the cursor is on; returns the empty line that follows it */
  function insertBlock(node) {
    const block = blockAtCaret() || doc.lastElementChild;
    let tail;
    if (block && isEmptyPara(block)) { doc.insertBefore(node, block); tail = block; }
    else {
      tail = el('p', '', '<br>');
      if (block) { block.after(node); node.after(tail); } else { doc.appendChild(node); doc.appendChild(tail); }
    }
    return tail;
  }
  function setCaret(target, selectAll) {
    try {
      doc.focus();
      const r = document.createRange();
      r.selectNodeContents(target);
      const empty = !(target.textContent || '').trim() && !target.querySelector('math-field');
      if (!selectAll || empty) r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch (e) { /* the content is in the document anyway */ }
  }
  window.eqBlocks = { blockAtCaret, insertBlock, isEmptyPara, setCaret };

  /* ============ building tables ============ */
  function makeTable(rows, cols, data, header) {
    const t = el('table', 'eq-table');
    const tb = document.createElement('tbody');
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement(header && r === 0 ? 'th' : 'td');
        const v = data && data[r] && data[r][c];
        if (v != null && String(v) !== '') cell.textContent = String(v); else cell.innerHTML = '<br>';
        tr.appendChild(cell);
      }
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    return t;
  }
  function insertTable(rows, cols, data, header) {
    rows = Math.max(1, Math.min(MAX_ROWS, rows | 0));
    cols = Math.max(1, Math.min(MAX_COLS, cols | 0));
    const t = makeTable(rows, cols, data, header);
    insertBlock(t);
    afterChange(true);
    setCaret(t.querySelector('td,th'), false);
    t.scrollIntoView({ block: 'nearest' });
    return t;
  }

  /* ============ the picker (Word's Table gallery) ============ */
  const QUICK = [
    { name: 'Sales by month', rows: [['Month', 'Sales', 'Profit'], ['Jan', 120, 30], ['Feb', 150, 42], ['Mar', 170, 51], ['Apr', 140, 35], ['May', 190, 60], ['Jun', 210, 72]] },
    { name: 'Class marks', rows: [['Student', 'Maths', 'Physics', 'Chemistry'], ['Ali', 78, 85, 72], ['Sara', 92, 88, 95], ['Usman', 65, 70, 60], ['Hina', 81, 76, 89]] },
    { name: 'Quarterly revenue', rows: [['Quarter', '2024', '2025'], ['Q1', 40, 52], ['Q2', 55, 61], ['Q3', 48, 70], ['Q4', 62, 78]] },
    { name: 'X Y values (for scatter)', rows: [['x', 'y'], [1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1]] }
  ];

  function buildPicker() {
    const panel = el('div', 'dropdown-panel no-focus-steal');
    panel.style.padding = '12px'; panel.style.minWidth = '0';
    const label = el('div', 'tp-label', 'Insert Table');
    const grid = el('div', 'tp-grid');
    const cells = [];
    for (let r = 1; r <= GRID_ROWS; r++) for (let c = 1; c <= GRID_COLS; c++) {
      const d = el('div', 'tp-cell'); d.dataset.r = r; d.dataset.c = c; grid.appendChild(d); cells.push(d);
    }
    const paint = (r, c) => {
      cells.forEach(d => d.classList.toggle('on', +d.dataset.r <= r && +d.dataset.c <= c));
      label.textContent = (r && c) ? c + 'x' + r + ' Table' : 'Insert Table';
    };
    grid.addEventListener('mousemove', e => { const d = e.target.closest('.tp-cell'); if (d) paint(+d.dataset.r, +d.dataset.c); });
    grid.addEventListener('mouseleave', () => paint(0, 0));
    grid.addEventListener('click', e => {
      const d = e.target.closest('.tp-cell');
      if (!d) return;
      closeAllDropdowns();
      insertTable(+d.dataset.r, +d.dataset.c);
    });
    panel.appendChild(label); panel.appendChild(grid); panel.appendChild(el('div', 'tp-sep'));

    const item = (text, fn) => {
      const it = el('div', 'menu-item', '<span></span>');
      it.firstChild.textContent = text;
      on(it, 'click', () => { closeAllDropdowns(); fn(); });
      return it;
    };
    panel.appendChild(item('Insert Table…', openDialog));
    const qt = el('div', 'panel-title', 'Quick Tables');
    qt.style.margin = '10px 0 4px 8px';
    panel.appendChild(qt);
    QUICK.forEach(q => panel.appendChild(item(q.name, () => insertTable(q.rows.length, q.rows[0].length, q.rows, true))));
    return panel;
  }

  /* ============ Insert Table… dialog ============ */
  let dlg = null;
  function openDialog() {
    if (!dlg) {
      dlg = el('div', 'eqmodal',
        '<div class="eqmodal-card" role="dialog" aria-label="Insert Table"><h3>Insert Table</h3>' +
        '<label>Number of columns<input type="number" id="tdCols" min="1" max="' + MAX_COLS + '" value="3"></label>' +
        '<label>Number of rows<input type="number" id="tdRows" min="1" max="' + MAX_ROWS + '" value="3"></label>' +
        '<div class="eqmodal-actions"><button class="btn" id="tdCancel">Cancel</button><button class="btn btn-primary" id="tdOk">OK</button></div></div>');
      document.body.appendChild(dlg);
      const close = () => dlg.classList.remove('open');
      const ok = () => {
        const c = +$('#tdCols').value, r = +$('#tdRows').value;
        if (!(c >= 1 && r >= 1)) return showToast('Enter at least 1 row and 1 column', 'warn');
        close(); insertTable(r, c);
      };
      on($('#tdCancel'), 'click', close);
      on($('#tdOk'), 'click', ok);
      on(dlg, 'click', e => { if (e.target === dlg) close(); });
      dlg.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter') { e.preventDefault(); ok(); }
      });
    }
    dlg.classList.add('open');
    setTimeout(() => $('#tdCols').focus(), 20);
  }

  /* ============ the cell the caret is in ============ */
  function currentCell() {
    const ae = document.activeElement;
    let n = (ae && ae.tagName === 'MATH-FIELD' && doc.contains(ae)) ? ae : null;
    if (!n) { const sel = getSelection(); if (sel.rangeCount) n = sel.anchorNode; }
    if (!n) return null;
    const e = n.nodeType === 1 ? n : n.parentElement;
    const cell = e && e.closest ? e.closest('td,th') : null;
    return (cell && doc.contains(cell)) ? cell : null;
  }
  window.eqCurrentCell = currentCell;

  /* ============ table operations ============ */
  const cellIndex = td => [...td.parentElement.children].indexOf(td);
  function addRow(tr, after) {
    const nr = document.createElement('tr');
    for (let i = 0; i < tr.cells.length; i++) nr.appendChild(el('td', '', '<br>'));
    if (after) tr.after(nr); else tr.before(nr);
    return nr;
  }
  function addCol(table, idx, after) {
    const pos = idx + (after ? 1 : 0);
    [...table.rows].forEach(tr => {
      const ref = tr.cells[Math.min(pos, tr.cells.length - 1)] || tr.cells[0];
      const c = el((ref && ref.tagName === 'TH') ? 'th' : 'td', '', '<br>');
      if (pos >= tr.cells.length) tr.appendChild(c); else tr.insertBefore(c, tr.cells[pos]);
    });
  }
  function retag(cell, tag) {
    const n = document.createElement(tag);
    while (cell.firstChild) n.appendChild(cell.firstChild);
    cell.replaceWith(n);
  }
  function toggleHeader(table) {
    const first = table.rows[0];
    if (!first) return;
    const makeHeader = [...first.cells].some(c => c.tagName === 'TD');
    [...first.cells].forEach(c => retag(c, makeHeader ? 'th' : 'td'));
  }
  function removeTable(table) {
    const near = table.nextElementSibling || table.previousElementSibling;
    table.remove();
    if (!doc.children.length) doc.innerHTML = '<p><br></p>';
    afterChange(true);
    if (near && near.tagName === 'P') setCaret(near, false);
  }
  function openChart(table) {
    if (typeof window.openChartPanelFor === 'function') window.openChartPanelFor(table);
    else showToast('Charts are not available (assets/charts.js is missing).', 'warn');
  }
  function act(name) {
    const td = currentCell();
    if (!td) return;
    const table = td.closest('table'), tr = td.parentElement, idx = cellIndex(td);
    if (name === 'rowBelow') { const nr = addRow(tr, true); setCaret(nr.cells[idx] || nr.cells[0], false); }
    else if (name === 'colRight') { addCol(table, idx, true); setCaret(td.nextElementSibling || td, false); }
    else if (name === 'delRow') {
      if (table.rows.length <= 1) return removeTable(table);
      const target = tr.nextElementSibling || tr.previousElementSibling;
      tr.remove();
      setCaret(target.cells[Math.min(idx, target.cells.length - 1)], false);
    } else if (name === 'delCol') {
      if (tr.cells.length <= 1) return removeTable(table);
      [...table.rows].forEach(r => { if (r.cells[idx]) r.cells[idx].remove(); });
      setCaret(tr.cells[Math.min(idx, tr.cells.length - 1)], false);
    } else if (name === 'header') toggleHeader(table);
    else if (name === 'delTable') return removeTable(table);
    else if (name === 'chart') return openChart(table);
    afterChange(true);
    scheduleBar();
  }

  /* ============ floating table tools ============ */
  const bar = el('div', 'obj-bar no-focus-steal');
  bar.id = 'tableBar';
  [['rowBelow', '+ Row', 'Insert a row below'], ['colRight', '+ Col', 'Insert a column to the right'],
   ['delRow', '− Row', 'Delete this row'], ['delCol', '− Col', 'Delete this column'],
   ['header', 'Header', 'Turn the first row into a header (or back)'],
   ['delTable', TRASH, 'Delete the table', 'danger'], ['chart', CHART + ' Chart', 'Make a chart from this table', 'primary']
  ].forEach(([a, html, tip, cls]) => {
    const b = el('button', cls || '', html);
    b.type = 'button'; b.dataset.act = a; b.title = tip; b.setAttribute('aria-label', tip);
    bar.appendChild(b);
  });
  document.body.appendChild(bar);
  on(bar, 'click', e => { const b = e.target.closest('button'); if (b) act(b.dataset.act); });

  function updateBar() {
    const td = currentCell();
    if (!td || root.classList.contains('cap')) return bar.classList.remove('show');
    const t = td.closest('table');
    const r = t.getBoundingClientRect(), w = workspace.getBoundingClientRect();
    if (r.bottom < w.top + 8 || r.top > w.bottom - 8) return bar.classList.remove('show');
    bar.classList.add('show');
    const bw = bar.offsetWidth;
    bar.style.top = Math.max(w.top + 4, r.top - 34) + 'px';
    bar.style.left = Math.max(w.left + 8, Math.min(r.right, w.right - 12) - bw) + 'px';
  }
  let barTimer = 0;
  function scheduleBar() { clearTimeout(barTimer); barTimer = setTimeout(updateBar, 40); }
  document.addEventListener('selectionchange', scheduleBar);
  document.addEventListener('focusin', scheduleBar, true);
  document.addEventListener('focusout', () => setTimeout(updateBar, 250), true);
  on(doc, 'input', scheduleBar);
  on(workspace, 'scroll', updateBar);
  on(window, 'resize', updateBar);
  setInterval(updateBar, 600);

  /* ============ keyboard: Tab / Shift+Tab move between cells ============ */
  on(doc, 'keydown', e => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target && e.target.tagName === 'MATH-FIELD') return;
    const td = currentCell();
    if (!td) return;
    e.preventDefault();
    const table = td.closest('table');
    const cells = [...table.querySelectorAll('td,th')];
    const i = cells.indexOf(td);
    let next = e.shiftKey ? cells[i - 1] : cells[i + 1];
    if (!next && !e.shiftKey) {                                   // Tab in the last cell adds a row (like Word)
      next = addRow(td.parentElement, true).cells[0];
      afterChange(true);
    }
    if (next) setCaret(next, true);
  });

  /* ============ Enter moves down one cell (like Excel); Shift+Enter up; Alt+Enter = new line inside the cell ============ */
  on(doc, 'keydown', e => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.isComposing) return;
    if (e.target && e.target.tagName === 'MATH-FIELD') return;     // inside an equation Enter is MathLive's job
    const td = currentCell();
    if (!td) return;
    e.preventDefault();
    if (e.altKey) {                                                // a line break inside the same cell
      document.execCommand('insertLineBreak');
      afterChange(true);
      return;
    }
    const tr = td.parentElement, idx = cellIndex(td);
    let row = e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling;
    if (!row && !e.shiftKey) {                                     // Enter in the last row adds a new row
      row = addRow(tr, true);
      afterChange(true);
    }
    if (row) setCaret(row.cells[Math.min(idx, row.cells.length - 1)], true);
  });

  /* ============ paste from Excel / Sheets / Word tables (tab-separated text) becomes a table ============ */
  doc.addEventListener('paste', e => {
    if (e.target && e.target.tagName === 'MATH-FIELD') return;
    const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (text.indexOf('\t') === -1 || text.indexOf('\n') === -1) return;
    const lines = text.replace(/\r/g, '').split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const rows = lines.map(l => l.split('\t'));
    const cols = Math.max(...rows.map(r => r.length));
    if (rows.length < 2 || rows.length > MAX_ROWS || cols < 2 || cols > MAX_COLS) return;
    e.preventDefault();
    e.stopPropagation();                                          // app.js would paste it as plain text
    insertTable(rows.length, cols, rows, false);
    showToast('Pasted as a table');
  }, true);

  /* ============ ribbon: Insert → Table ============ */
  const tbtn = $('#tableBtn');
  if (tbtn) bindPanel(tbtn, buildPicker);
})();