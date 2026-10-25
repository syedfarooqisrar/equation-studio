/* 📁 FILE: assets/charts.js
   Excel-style charts: a right-side "Insert Chart" panel that reads the table you are in, shows every chart type
   with a live preview of YOUR data, and adds the chosen chart at the cursor. Drawn with Chart.js (offline).
   Charts are stored in the document as <div class="eq-chart" data-chart="{json}"> and redrawn when loaded.
   Uses globals from app.js / tables.js: doc, $, $$, on, showToast, afterChange, reportError, window.eqBlocks. */
'use strict';
(function () {
  const PALETTE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E', '#636363', '#997300'];
  const SIZES = [[420, 260], [560, 320], [620, 360]];
  const CATALOG = [
    { id: 'column', name: 'Column', items: [{ v: 'clustered', name: 'Clustered Column' }, { v: 'stacked', name: 'Stacked Column' }, { v: 'percent', name: '100% Stacked Column' }] },
    { id: 'bar', name: 'Bar', items: [{ v: 'clustered', name: 'Clustered Bar' }, { v: 'stacked', name: 'Stacked Bar' }, { v: 'percent', name: '100% Stacked Bar' }] },
    { id: 'line', name: 'Line', items: [{ v: 'line', name: 'Line' }, { v: 'markers', name: 'Line with Markers' }, { v: 'stacked', name: 'Stacked Line' }] },
    { id: 'pie', name: 'Pie', items: [{ v: 'pie', name: 'Pie' }, { v: 'doughnut', name: 'Doughnut' }] },
    { id: 'area', name: 'Area', items: [{ v: 'area', name: 'Area' }, { v: 'stacked', name: 'Stacked Area' }, { v: 'percent', name: '100% Stacked Area' }] },
    { id: 'scatter', name: 'X Y (Scatter)', items: [{ v: 'markers', name: 'Scatter' }, { v: 'lines', name: 'Scatter with Straight Lines' }] },
    { id: 'radar', name: 'Radar', items: [{ v: 'lines', name: 'Radar' }, { v: 'filled', name: 'Filled Radar' }] },
    { id: 'combo', name: 'Combo', items: [{ v: 'columnline', name: 'Clustered Column – Line' }] }
  ];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const nameOf = (kind, v) => { const c = CATALOG.find(x => x.id === kind); const it = c && c.items.find(i => i.v === v); return it ? it.name : kind; };
  const hasChart = () => typeof window.Chart !== 'undefined';
  if (hasChart()) { try { Chart.defaults.font.family = '"Segoe UI",Arial,sans-serif'; } catch (e) { /* default font */ } }

  /* ============ reading numbers out of a table ============ */
  function cellText(c) {
    let t = (c.textContent || '').replace(/[\u200B]/g, '').replace(/\u00A0/g, ' ').trim();
    if (!t) { const m = c.querySelector('math-field'); if (m) t = m.getAttribute('value') || ''; }
    return t;
  }
  function num(s) {
    const t = String(s).replace(/[,\s$€£%]|Rs\.?/gi, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    return parseFloat(t);
  }
  function readMatrix(table) {
    const rows = [...table.rows].map(tr => [...tr.cells].map(cellText));
    const C = Math.max(0, ...rows.map(r => r.length));
    return rows.map(r => { while (r.length < C) r.push(''); return r; });
  }
  const transpose = M => (M.length ? M[0].map((_, c) => M.map(r => r[c])) : []);
  function guessFlags(M) {
    if (!M.length || !M[0].length) return { header: false, labelCol: false };
    const header = M.length > 1 && M[0].some(x => x !== '' && isNaN(num(x))) && M.slice(1).some(r => r.some(x => !isNaN(num(x))));
    const body = header ? M.slice(1) : M;
    const col0 = body.map(r => r[0]).filter(x => x !== '');
    const text = col0.filter(x => isNaN(num(x))).length;
    return { header, labelCol: M[0].length > 1 && col0.length > 0 && text >= Math.ceil(col0.length / 2) };
  }
  function extract(st) {
    let M = readMatrix(st.table);
    if (st.sw) M = transpose(M);
    if (!M.length || !M[0].length) return null;
    const head = st.header ? M[0] : null, body = st.header ? M.slice(1) : M, start = st.labelCol ? 1 : 0;
    const labels = body.map((r, i) => (st.labelCol && r[0]) ? r[0] : String(i + 1));
    const series = [];
    for (let c = start; c < M[0].length; c++) {
      const data = body.map(r => { const v = num(r[c]); return Number.isFinite(v) ? v : null; });
      if (!data.some(v => v !== null)) continue;
      series.push({ name: (head && head[c]) ? head[c] : 'Series ' + (series.length + 1), data });
    }
    if (!series.length || !labels.length) return null;
    return { labels, series, labelsNumeric: st.labelCol && labels.every(l => Number.isFinite(num(l))) };
  }
  function scatterSet(d) {
    if (d.labelsNumeric) return { xs: d.labels.map(num), series: d.series };
    if (d.series.length >= 2) return { xs: d.series[0].data, series: d.series.slice(1) };
    return { xs: d.labels.map((_, i) => i + 1), series: d.series };
  }
  function makeSpec(kind, variant, d, title) {
    let series = d.series, xs = null;
    if (kind === 'scatter') { const sc = scatterSet(d); xs = sc.xs.slice(0, 200); series = sc.series; }
    return {
      kind, variant,
      title: title || (series.length === 1 ? series[0].name : ''),
      labels: d.labels.slice(0, 200).map(s => String(s).slice(0, 60)),
      series: series.slice(0, 20).map(s => ({ name: String(s.name).slice(0, 60), data: s.data.slice(0, 200) })),
      xs, w: 560, h: 320
    };
  }
  function recommend(d) {
    const n = d.labels.length, k = d.series.length;
    const nonNeg = d.series.every(s => s.data.every(v => v === null || v >= 0));
    const timeLike = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|19\d\d|20\d\d|mon|tue|wed|thu|fri|sat|sun)/i.test(String(d.labels[0] || ''));
    const out = [];
    if (k === 1 && n <= 8 && nonNeg) out.push(['pie', 'pie']);
    out.push(['column', 'clustered']);
    if (timeLike) out.push(['line', 'markers']);
    out.push(['bar', 'clustered']);
    if (!timeLike) out.push(['line', 'markers']);
    if (k >= 2) out.push(['column', 'stacked'], ['area', 'stacked']);
    if (k === 1 && n <= 8 && nonNeg) out.push(['pie', 'doughnut']);
    if (d.labelsNumeric || k >= 2) out.push(['scatter', 'markers']);
    const seen = new Set();
    return out.filter(([a, b]) => { const key = a + b; if (seen.has(key)) return false; seen.add(key); return true; })
              .slice(0, 6).map(([kind, v]) => ({ kind, variant: v, name: nameOf(kind, v) }));
  }

  /* ============ validating a stored spec (the saved document is untrusted) ============ */
  function normalizeSpec(raw) {
    let o;
    try { o = JSON.parse(raw); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || !CATALOG.some(c => c.id === o.kind)) return null;
    const arr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
    const fin = x => (typeof x === 'number' && Number.isFinite(x)) ? x : null;
    const spec = {
      kind: o.kind, variant: String(o.variant || '').slice(0, 20), title: String(o.title || '').slice(0, 120),
      labels: arr(o.labels, 200).map(x => String(x).slice(0, 60)),
      series: arr(o.series, 20).map(s => ({ name: String((s && s.name) || '').slice(0, 60), data: arr(s && s.data, 200).map(fin) })),
      xs: Array.isArray(o.xs) ? arr(o.xs, 200).map(fin) : null,
      w: Math.max(240, Math.min(900, Number(o.w) || 560)), h: Math.max(160, Math.min(700, Number(o.h) || 320))
    };
    return spec.series.length ? spec : null;
  }

  /* ============ Chart.js configuration ============ */
  function toPercent(series, n) {
    const totals = [];
    for (let i = 0; i < n; i++) totals.push(series.reduce((a, s) => a + (Number.isFinite(s.data[i]) ? Math.abs(s.data[i]) : 0), 0));
    return series.map(s => ({ name: s.name, data: s.data.map((x, i) => (Number.isFinite(x) && totals[i]) ? x / totals[i] * 100 : null) }));
  }
  function buildConfig(spec, thumb) {
    const kind = spec.kind, v = spec.variant, labels = spec.labels;
    const pct = v === 'percent';
    const series = pct ? toPercent(spec.series, labels.length) : spec.series;
    const col = i => PALETTE[i % PALETTE.length];
    const text = '#404040', gridColor = '#e3e3e3';
    const axis = extra => Object.assign({
      grid: { color: gridColor }, border: { color: '#bfbfbf' },
      ticks: { color: text, display: !thumb, maxRotation: 45 }
    }, extra || {});
    const pctTicks = a => { a.max = 100; a.ticks = Object.assign({}, a.ticks, { callback: x => x + '%' }); };
    const options = {
      responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: 2, events: [],
      layout: { padding: thumb ? 4 : 10 },
      plugins: {
        title: { display: !thumb && !!spec.title, text: spec.title, color: '#262626', font: { size: 15, weight: '600' }, padding: { bottom: 10 } },
        legend: { display: !thumb && (series.length > 1 || kind === 'pie'), position: 'bottom', labels: { color: text, boxWidth: 12, boxHeight: 12 } },
        tooltip: { enabled: false }
      }
    };

    if (kind === 'column' || kind === 'bar') {
      const horiz = kind === 'bar', stacked = v === 'stacked' || pct;
      options.indexAxis = horiz ? 'y' : 'x';
      const val = axis({ stacked, beginAtZero: true });
      const cat = axis({ stacked, grid: { display: false } });
      if (pct) pctTicks(val);
      options.scales = horiz ? { x: val, y: cat } : { x: cat, y: val };
      return { type: 'bar', data: { labels, datasets: series.map((s, i) => ({ label: s.name, data: s.data, backgroundColor: col(i), borderWidth: 0 })) }, options };
    }
    if (kind === 'line' || kind === 'area') {
      const area = kind === 'area', stacked = v === 'stacked' || pct;
      const y = axis({ stacked, beginAtZero: true });
      if (pct) pctTicks(y);
      options.scales = { x: axis({ stacked, grid: { display: false } }), y };
      return {
        type: 'line', options,
        data: {
          labels, datasets: series.map((s, i) => ({
            label: s.name, data: s.data, borderColor: col(i), backgroundColor: area ? col(i) + '99' : col(i), fill: area, tension: 0,
            borderWidth: 2, pointRadius: v === 'markers' ? 4 : 0, pointBackgroundColor: col(i), spanGaps: false
          }))
        }
      };
    }
    if (kind === 'pie') {
      const s0 = series[0];
      options.plugins.legend.position = 'right';
      return {
        type: v === 'doughnut' ? 'doughnut' : 'pie', options,
        data: { labels, datasets: [{ label: s0.name, data: s0.data.map(x => (Number.isFinite(x) && x > 0) ? x : 0), backgroundColor: labels.map((_, i) => col(i)), borderColor: '#fff', borderWidth: 2 }] }
      };
    }
    if (kind === 'scatter') {
      const xs = spec.xs || labels.map((_, i) => i + 1);
      options.scales = { x: axis({ type: 'linear' }), y: axis() };
      return {
        type: 'scatter', options,
        data: {
          datasets: series.map((s, i) => ({
            label: s.name, showLine: v === 'lines', borderColor: col(i), backgroundColor: col(i), borderWidth: 2, pointRadius: thumb ? 2 : 5,
            data: s.data.map((y, k) => ({ x: xs[k], y })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
          }))
        }
      };
    }
    if (kind === 'radar') {
      const filled = v === 'filled';
      options.scales = { r: { beginAtZero: true, grid: { color: gridColor }, angleLines: { color: gridColor }, ticks: { color: text, backdropColor: 'transparent', display: !thumb }, pointLabels: { color: text, display: !thumb } } };
      return {
        type: 'radar', options,
        data: { labels, datasets: series.map((s, i) => ({ label: s.name, data: s.data, borderColor: col(i), backgroundColor: filled ? col(i) + '66' : 'transparent', fill: filled, borderWidth: 2, pointRadius: thumb ? 0 : 3 })) }
      };
    }
    options.scales = { x: axis({ grid: { display: false } }), y: axis({ beginAtZero: true }) };    // combo
    return {
      type: 'bar', options,
      data: {
        labels, datasets: series.map((s, i) => i === 0
          ? { type: 'bar', label: s.name, data: s.data, backgroundColor: col(0), borderWidth: 0 }
          : { type: 'line', label: s.name, data: s.data, borderColor: col(i), backgroundColor: col(i), tension: 0, borderWidth: 2, pointRadius: thumb ? 0 : 4, fill: false })
      }
    };
  }

  /* ============ drawing a chart block that lives in the document ============ */
  function renderBlock(div) {
    const spec = normalizeSpec(div.getAttribute('data-chart') || '');
    div.textContent = '';
    if (!spec) { div.style.lineHeight = '1.4'; div.textContent = 'This chart has no data.'; return; }
    if (!hasChart()) { div.style.lineHeight = '1.4'; div.textContent = 'Charts need assets\\chart.umd.min.js (run tools\\download_chartjs.ps1).'; return; }
    const cv = document.createElement('canvas');
    cv.width = spec.w; cv.height = spec.h;
    cv.style.width = spec.w + 'px'; cv.style.height = spec.h + 'px';
    div.appendChild(cv);
    try { new Chart(cv, buildConfig(spec, false)); }
    catch (e) { div.textContent = 'This chart could not be drawn.'; reportError('chart', e); }
  }
  const renderAll = () => $$('.eq-chart', doc).forEach(renderBlock);

  /* charts are redrawn whenever the document is restored (load, undo, redo) */
  const baseRestore = window.restoreDoc;
  if (typeof baseRestore === 'function') {
    window.restoreDoc = function () { const r = baseRestore.apply(this, arguments); renderAll(); return r; };
  }
  renderAll();

  /* ============ inserting ============ */
  function addChart(spec) {
    const div = el('div', 'eq-chart');
    div.setAttribute('contenteditable', 'false');
    div.setAttribute('data-chart', JSON.stringify(spec));
    const tail = window.eqBlocks.insertBlock(div);
    renderBlock(div);
    afterChange(true);
    window.eqBlocks.setCaret(tail, false);
    div.scrollIntoView({ block: 'nearest' });
    showToast('Chart added');
  }

  /* ============ the right-side panel ============ */
  const panel = $('#chartPanel'), body = $('#chBody'), shell = $('#wsShell');
  let state = null, thumbs = [];
  const destroyThumbs = () => { thumbs.forEach(c => { try { c.destroy(); } catch (e) { /* gone */ } }); thumbs = []; };

  function openFor(table) {
    if (!hasChart()) return showToast('Charts need assets\\chart.umd.min.js. Run tools\\download_chartjs.ps1.', 'error');
    const g = guessFlags(readMatrix(table));
    state = { table, header: g.header, labelCol: g.labelCol, sw: false, title: '', cat: 'recommended' };
    shell.classList.remove('solve-open');
    shell.classList.add('chart-open');
    render();
  }
  window.openChartPanelFor = openFor;
  function closePanel() { shell.classList.remove('chart-open'); destroyThumbs(); state = null; }

  function checkbox(label, checked, onChange) {
    const l = el('label'), c = el('input'); c.type = 'checkbox'; c.checked = checked;
    c.addEventListener('change', () => onChange(c.checked));
    l.appendChild(c); l.appendChild(document.createTextNode(label));
    return l;
  }
  function render() {
    destroyThumbs();
    body.innerHTML = '';
    if (!state || !document.contains(state.table)) {
      body.appendChild(el('div', 'ch-empty', 'The table is gone. Click inside a table and press the 📊 Chart button again.'));
      return;
    }
    const d = extract(state);
    body.appendChild(el('p', 'ch-info', d
      ? 'Data from your table: <b>' + d.labels.length + '</b> categories, <b>' + d.series.length + '</b> series'
      : 'Data from your table'));
    const opts = el('div', 'ch-opts');
    opts.appendChild(checkbox('First row is a header', state.header, v => { state.header = v; render(); }));
    opts.appendChild(checkbox('First column is labels', state.labelCol, v => { state.labelCol = v; render(); }));
    opts.appendChild(checkbox('Switch rows / columns', state.sw, v => {
      state.sw = v;
      const M = v ? transpose(readMatrix(state.table)) : readMatrix(state.table);
      const g = guessFlags(M); state.header = g.header; state.labelCol = g.labelCol;
      render();
    }));
    const title = el('input', 'ch-title');
    title.type = 'text'; title.placeholder = 'Chart title (optional)'; title.value = state.title; title.maxLength = 120;
    title.addEventListener('input', () => { state.title = title.value; });
    title.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
    opts.appendChild(title);
    body.appendChild(opts);

    if (!d) {
      body.appendChild(el('div', 'ch-empty', 'No numbers were found. Type numbers in the table cells (one column per series), then press <b>Refresh</b>.'));
      const rb = el('button', 'btn', 'Refresh'); rb.type = 'button'; rb.style.marginTop = '10px';
      rb.addEventListener('click', () => { const g = guessFlags(readMatrix(state.table)); state.header = g.header; state.labelCol = g.labelCol; render(); });
      body.appendChild(rb);
      return;
    }

    const chips = el('div', 'ch-chips');
    [{ id: 'recommended', name: 'Recommended' }].concat(CATALOG).forEach(c => {
      const b = el('button', 'chip-btn' + (c.id === state.cat ? ' active' : ''), c.name);
      b.type = 'button';
      b.addEventListener('click', () => { state.cat = c.id; render(); });
      chips.appendChild(b);
    });
    body.appendChild(chips);

    const entries = state.cat === 'recommended' ? recommend(d)
      : CATALOG.find(c => c.id === state.cat).items.map(it => ({ kind: state.cat, variant: it.v, name: it.name }));
    const grid = el('div', 'ch-grid');
    entries.forEach(en => {
      const card = el('button', 'ch-card'); card.type = 'button'; card.title = 'Add: ' + en.name;
      const cv = document.createElement('canvas'); cv.width = 150; cv.height = 100; cv.style.width = '150px'; cv.style.height = '100px';
      card.appendChild(cv); card.appendChild(el('div', 'ch-cap', en.name));
      try { thumbs.push(new Chart(cv, buildConfig(makeSpec(en.kind, en.variant, d, ''), true))); } catch (e) { /* the name is still clickable */ }
      card.addEventListener('click', () => addChart(makeSpec(en.kind, en.variant, d, state.title)));
      grid.appendChild(card);
    });
    body.appendChild(grid);
    body.appendChild(el('div', 'ch-hint', 'Click a chart to add it at your cursor. Pie charts use the first series.'));
  }
  on($('#chClose'), 'click', closePanel);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && shell.classList.contains('chart-open')) closePanel(); });

  /* ribbon: Insert → Chart */
  const rb = $('#chartRibbonBtn');
  if (rb) on(rb, 'click', () => {
    const td = window.eqCurrentCell && window.eqCurrentCell();
    if (td) return openFor(td.closest('table'));
    const tables = $$('table.eq-table', doc);
    if (tables.length === 1) return openFor(tables[0]);
    showToast(tables.length ? 'Click inside the table you want to chart.' : 'Insert a table first (Insert → Table).', 'warn');
  });

  /* ============ small tools over a chart (size, copy picture, delete) ============ */
  const cbar = el('div', 'obj-bar no-focus-steal'); cbar.id = 'chartBar';
  [['size', 'Size', 'Change the chart size'], ['copy', 'Copy picture', 'Copy the chart as a picture (paste into Word)'],
   ['del', 'Delete', 'Delete the chart', 'danger']].forEach(([a, t, tip, cls]) => {
    const b = el('button', cls || '', t); b.type = 'button'; b.dataset.act = a; b.title = tip; cbar.appendChild(b);
  });
  document.body.appendChild(cbar);
  let hoverEl = null, hideT = 0;
  function placeBar() {
    if (!hoverEl || !document.contains(hoverEl)) return cbar.classList.remove('show');
    const r = hoverEl.getBoundingClientRect(), w = workspace.getBoundingClientRect();
    if (r.bottom < w.top + 10 || r.top > w.bottom - 10) return cbar.classList.remove('show');
    cbar.classList.add('show');
    cbar.style.left = Math.max(w.left + 4, r.right - cbar.offsetWidth - 8) + 'px';
    cbar.style.top = Math.max(w.top + 4, r.top + 8) + 'px';
  }
  const hideLater = () => { clearTimeout(hideT); hideT = setTimeout(() => { cbar.classList.remove('show'); hoverEl = null; }, 350); };
  doc.addEventListener('mouseover', e => { const c = e.target.closest && e.target.closest('.eq-chart'); if (c) { hoverEl = c; clearTimeout(hideT); placeBar(); } });
  doc.addEventListener('mouseout', e => {
    if (!(e.target.closest && e.target.closest('.eq-chart'))) return;
    const to = e.relatedTarget;
    if (to && to.closest && (to.closest('.eq-chart') || to.closest('#chartBar'))) return;
    hideLater();
  });
  cbar.addEventListener('mouseenter', () => clearTimeout(hideT));
  cbar.addEventListener('mouseleave', hideLater);
  on(workspace, 'scroll', placeBar);
  on(cbar, 'click', e => {
    const b = e.target.closest('button');
    if (!b || !hoverEl) return;
    const div = hoverEl;
    if (b.dataset.act === 'size') {
      const spec = normalizeSpec(div.getAttribute('data-chart') || '');
      if (!spec) return;
      let i = SIZES.findIndex(s => s[0] === spec.w && s[1] === spec.h);
      i = (i + 1) % SIZES.length;
      spec.w = SIZES[i][0]; spec.h = SIZES[i][1];
      div.setAttribute('data-chart', JSON.stringify(spec));
      renderBlock(div); afterChange(true); placeBar();
    } else if (b.dataset.act === 'copy') {
      cbar.classList.remove('show');
      if (typeof window.copyNodeAsImage === 'function') window.copyNodeAsImage(div);
      else showToast('Copy picture needs assets/clipboard.js', 'warn');
    } else if (b.dataset.act === 'del') {
      cbar.classList.remove('show'); hoverEl = null;
      div.remove();
      if (!doc.children.length) doc.innerHTML = '<p><br></p>';
      afterChange(true);
      showToast('Chart deleted. Press Ctrl+Z to undo', 'warn');
    }
  });
})();