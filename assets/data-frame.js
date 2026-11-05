/* 📁 FILE: assets/data-frame.js
   Runs inside assets/data-studio.html (iframe). Starts Univer (plugin mode) and talks to the editor with postMessage.
   In : {type:'export', kind:'xlsx'|'csv'|'json'} | {type:'load', res} | {type:'load-snapshot', snapshot} | {type:'new'} | {type:'flush'}
   Out: ready | fatal | status | exported | autosave | problem */
'use strict';
(function () {
  const MAX_CELLS = 300000, MAX_SAVE_CHARS = 25000000, AUTOSAVE_MS = 15000;
  const msg = document.getElementById('msg');
  const say = (t, err) => { msg.textContent = t || ''; msg.className = err ? 'err' : ''; msg.style.display = t ? 'flex' : 'none'; };
  const tell = m => { try { parent.postMessage(m, '*'); } catch (e) { /* the editor is gone */ } };
  let univer = null, api = null, lastSave = '', warnedBig = false;

  function boot() {
    const need = ['React', 'ReactDOM', 'rxjs', 'UniverCore', 'UniverCoreFacade', 'UniverEngineRender', 'UniverEngineFormula',
      'UniverUi', 'UniverDocs', 'UniverDocsUi', 'UniverSheets', 'UniverSheetsUi', 'UniverSheetsFormula', 'UniverSheetsFormulaUi',
      'UniverSheetsNumfmt', 'UniverSheetsNumfmtUi', 'UniverDesignEnUS', 'UniverUiEnUS', 'UniverSheetsEnUS', 'UniverSheetsUiEnUS',
      'UniverDocsUiEnUS', 'UniverSheetsFormulaUiEnUS', 'UniverSheetsNumfmtUiEnUS'];
    const missing = need.filter(k => typeof window[k] === 'undefined');
    if (missing.length) throw new Error('The spreadsheet engine files are missing or did not load (' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? ', …' : '') + '). Run: powershell -ExecutionPolicy Bypass -File tools\\download_univer.ps1 -Force');
    const { Univer, LocaleType, mergeLocales, UniverInstanceType } = UniverCore;
    const { FUniver } = UniverCoreFacade;
    univer = new Univer({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales(UniverDesignEnUS, UniverUiEnUS, UniverSheetsEnUS, UniverSheetsUiEnUS,
          UniverDocsUiEnUS, UniverSheetsFormulaUiEnUS, UniverSheetsNumfmtUiEnUS)
      }
    });
    univer.registerPlugin(UniverEngineRender.UniverRenderEnginePlugin);
    univer.registerPlugin(UniverEngineFormula.UniverFormulaEnginePlugin);
    univer.registerPlugin(UniverUi.UniverUIPlugin, { container: 'app' });
    univer.registerPlugin(UniverDocs.UniverDocsPlugin);
    univer.registerPlugin(UniverDocsUi.UniverDocsUIPlugin);
    univer.registerPlugin(UniverSheets.UniverSheetsPlugin);
    univer.registerPlugin(UniverSheetsUi.UniverSheetsUIPlugin);
    univer.registerPlugin(UniverSheetsFormula.UniverSheetsFormulaPlugin);
    univer.registerPlugin(UniverSheetsFormulaUi.UniverSheetsFormulaUIPlugin);
    univer.registerPlugin(UniverSheetsNumfmt.UniverSheetsNumfmtPlugin);
    univer.registerPlugin(UniverSheetsNumfmtUi.UniverSheetsNumfmtUIPlugin);
    univer.createUnit(UniverInstanceType.UNIVER_SHEET, {});
    api = FUniver.newAPI(univer);
  }

  /* ---------- styles: Univer <-> the small style set the file service understands ---------- */
  const hexOf = x => {
    const s = x && typeof x.rgb === 'string' ? x.rgb.trim() : '';
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return m ? '#' + [m[1], m[2], m[3]].map(n => Math.min(255, +n).toString(16).padStart(2, '0')).join('') : null;
  };
  function pick(st) {
    if (!st || typeof st !== 'object') return null;
    const o = {};
    if (st.bl === 1 || st.bl === true) o.bl = 1;
    if (st.it === 1 || st.it === true) o.it = 1;
    const bg = hexOf(st.bg); if (bg) o.bg = bg;
    const cl = hexOf(st.cl); if (cl) o.cl = cl;
    if (st.ht === 1 || st.ht === 2 || st.ht === 3) o.ht = st.ht;
    if (st.n && typeof st.n.pattern === 'string' && st.n.pattern && st.n.pattern !== 'General') o.n = st.n.pattern;
    return Object.keys(o).length ? o : null;
  }
  function toUniver(st) {
    const o = {};
    if (st.bl) o.bl = 1;
    if (st.it) o.it = 1;
    if (st.bg) o.bg = { rgb: st.bg };
    if (st.cl) o.cl = { rgb: st.cl };
    if (st.ht) o.ht = st.ht;
    if (st.n) o.n = { pattern: st.n };
    return o;
  }
  const richText = c => (c.p && c.p.body && typeof c.p.body.dataStream === 'string') ? c.p.body.dataStream.replace(/[\r\n]+$/, '') : null;
  const snapshotOf = wb => (typeof wb.save === 'function' ? wb.save() : wb.getSnapshot());

  /* Current workbook -> sheets for Python: cells [row, col, value, formula, style index], styles, merges, widths */
  function readSheets() {
    const wb = api.getActiveWorkbook();
    if (!wb) throw new Error('No sheet is open.');
    const snap = snapshotOf(wb);
    const styleMap = snap.styles || {};
    const order = (snap.sheetOrder && snap.sheetOrder.length) ? snap.sheetOrder : Object.keys(snap.sheets || {});
    let total = 0, active = 0;
    try { const id = wb.getActiveSheet().getSheetId(); const i = order.indexOf(id); if (i >= 0) active = i; } catch (e) { /* first sheet */ }
    const sheets = order.map(id => {
      const sh = snap.sheets[id] || {}, data = sh.cellData || {}, cells = [], styles = [], idx = {};
      Object.keys(data).forEach(r => {
        const row = data[r] || {};
        Object.keys(row).forEach(c => {
          const cell = row[c];
          if (!cell) return;
          let v = cell.v;
          if (v === undefined || v === null) { const t = richText(cell); if (t !== null) v = t; }
          const f = typeof cell.f === 'string' ? cell.f : '';
          if (!f && (v === undefined || v === null || v === '')) return;
          if (cell.t === 3 && typeof v === 'number') v = !!v;
          let si = -1;
          const st = pick(typeof cell.s === 'string' ? styleMap[cell.s] : cell.s);
          if (st) {
            const k = JSON.stringify(st);
            if (!(k in idx) && styles.length < 500) { idx[k] = styles.length; styles.push(st); }
            if (k in idx) si = idx[k];
          }
          cells.push([+r, +c, v === undefined ? null : v, f, si]);
          if (++total > MAX_CELLS) throw new Error('Too many cells to save (maximum ' + MAX_CELLS.toLocaleString('en-US') + ').');
        });
      });
      const merges = (sh.mergeData || []).map(m => [m.startRow, m.startColumn, m.endRow, m.endColumn]);
      const colData = sh.columnData || {};
      const cols = Object.keys(colData).map(c => [+c, Math.round(+(colData[c] && colData[c].w))]).filter(x => x[1] > 0);
      return { name: String(sh.name || 'Sheet'), cells, styles, merges, cols };
    });
    return { sheets, active, name: String(snap.name || 'spreadsheet') };
  }

  /* Sheets from Python -> Univer workbook data */
  function buildWorkbook(res) {
    const sheets = {}, order = [];
    res.sheets.forEach((s, i) => {
      const id = 'sheet' + (i + 1), cellData = {}, styles = s.styles || [];
      let maxR = 0, maxC = 0;
      s.cells.forEach(([r, c, v, f, si]) => {
        const cell = {};
        if (typeof v === 'boolean') { cell.v = v ? 1 : 0; cell.t = 3; }
        else if (typeof v === 'number') { cell.v = v; cell.t = 2; }
        else if (typeof v === 'string') { cell.v = v; cell.t = 1; }
        if (f) cell.f = f;
        if (!f && cell.v === undefined) return;
        if (si >= 0 && styles[si]) cell.s = toUniver(styles[si]);
        (cellData[r] = cellData[r] || {})[c] = cell;
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      });
      const columnData = {};
      (s.cols || []).forEach(([c, w]) => { columnData[c] = { w }; });
      const mergeData = (s.merges || []).map(([r1, c1, r2, c2]) => ({ startRow: r1, startColumn: c1, endRow: r2, endColumn: c2 }));
      sheets[id] = { id, name: s.name, rowCount: Math.max(100, maxR + 30), columnCount: Math.max(26, maxC + 6), cellData, columnData, mergeData };
      order.push(id);
    });
    return { id: 'wb' + Date.now(), name: res.name || 'Imported', sheetOrder: order, sheets };
  }

  function replaceWorkbook(data) {
    const old = api.getActiveWorkbook();
    if (old) {
      const id = old.getId();
      try { api.disposeUnit(id); }
      catch (e1) { try { univer.disposeUnit(id); } catch (e2) { console.log('disposeUnit: ' + e2.message); } }
    }
    if (typeof api.createWorkbook === 'function') api.createWorkbook(data);
    else univer.createUnit(UniverCore.UniverInstanceType.UNIVER_SHEET, data);
  }

  /* ---------- autosave: the whole Univer snapshot (all formatting included) goes to Python ---------- */
  function autosaveNow() {
    if (!api) return;
    try {
      const wb = api.getActiveWorkbook();
      if (!wb) return;
      const s = JSON.stringify(snapshotOf(wb));
      if (s === lastSave) return;
      if (s.length > MAX_SAVE_CHARS) {
        if (!warnedBig) { warnedBig = true; tell({ type: 'problem', message: 'This sheet is too large to autosave. Save it as .xlsx.' }); }
        return;
      }
      lastSave = s;
      tell({ type: 'autosave', json: s });
    } catch (e) { console.log('JS ERROR [autosave]: ' + e.message); }
  }
  setInterval(autosaveNow, AUTOSAVE_MS);

  window.addEventListener('message', e => {
    if (e.source !== parent || !e.data || typeof e.data.type !== 'string' || !api) return;
    const m = e.data;
    try {
      if (m.type === 'export') {
        const d = readSheets();
        const kind = ['csv', 'json'].includes(m.kind) ? m.kind : 'xlsx';
        tell({ type: 'exported', kind, name: d.name, active: d.active, sheets: d.sheets });
      } else if (m.type === 'load' && m.res && Array.isArray(m.res.sheets)) {
        replaceWorkbook(buildWorkbook(m.res));
        const n = m.res.sheets.reduce((a, s) => a + s.cells.length, 0);
        tell({ type: 'status', text: (m.res.name || 'File') + ': ' + m.res.sheets.length + ' sheet(s), ' + n.toLocaleString('en-US') + ' cells' });
      } else if (m.type === 'load-snapshot' && m.snapshot && m.snapshot.sheets) {
        replaceWorkbook(m.snapshot);
        tell({ type: 'status', text: 'Your last sheet was restored' });
      } else if (m.type === 'new') {
        replaceWorkbook({});
        lastSave = '';
        autosaveNow();
        tell({ type: 'status', text: 'New empty sheet' });
      } else if (m.type === 'flush') {
        autosaveNow();
      }
    } catch (err) {
      console.log('JS ERROR [data-frame]: ' + err.message);
      tell({ type: 'problem', message: err.message });
    }
  });

  try {
    boot();
    say('');
    tell({ type: 'ready' });
  } catch (err) {
    console.log('JS ERROR [data-frame boot]: ' + err.message);
    say(err.message, true);
    tell({ type: 'fatal', message: err.message });
  }
})();