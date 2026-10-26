/* 📁 FILE: assets/insert.js
   Word-style Insert tab: Cover Page, Blank Page, Page Break, Pictures, Link, Date & Time, Symbol,
   Header & Footer, Page Number. Uses home.js helpers and tables.js (window.eqBlocks). */
'use strict';
(function () {
  const esc = eqEsc, el = eqEl, ico = eqIco, B = window.eqBlocks;
  const readJson = (k, d) => { try { const v = JSON.parse(store.get(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };

  /* ---------- icons on this tab ---------- */
  $$('#tabInsert [data-i]').forEach(e => { e.innerHTML = ico(e.dataset.i, +e.dataset.s || 16); });

  /* ---------- pages ---------- */
  function mkBreak() { const d = el('div', 'eq-pagebreak'); d.setAttribute('contenteditable', 'false'); d.setAttribute('data-pb', '1'); return d; }
  function insPageBreak() { const tail = B.insertBlock(mkBreak()); afterChange(true); B.setCaret(tail, false); }
  function insBlankPage() {
    const tail = B.insertBlock(mkBreak());
    tail.before(el('p', '', '<br>')); tail.before(mkBreak());
    afterChange(true); B.setCaret(tail, false);
  }
  const para = (html, cls, style) => { const p = el('p', cls || '', html); if (style) p.setAttribute('style', style); return p; };
  const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const COVERS = {
    thesis: () => [
      para('THESIS TITLE GOES HERE', 'eq-title', 'margin-top:110px'),
      para('A thesis submitted in partial fulfilment of the requirements for the degree of Master of Science', 'eq-subtitle'),
      para('by', '', 'text-align:center;margin-top:36px'),
      para('<b>Author Name</b>', 'eq-subtitle'),
      para('Supervisor: Dr. Supervisor Name', '', 'text-align:center;margin-top:36px'),
      para('Department of Department Name', '', 'text-align:center;margin-top:70px'),
      para('University Name', '', 'text-align:center'),
      para(today(), '', 'text-align:center;margin-top:36px')
    ],
    simple: () => [
      para('Report Title', 'eq-title', 'margin-top:150px'),
      para('Subtitle or course name', 'eq-subtitle'),
      para('<b>Author Name</b>', '', 'text-align:center;margin-top:70px'),
      para(today(), '', 'text-align:center')
    ]
  };
  function insCover(kind) {
    const nodes = COVERS[kind](); nodes.push(mkBreak());
    const first = doc.firstChild;
    nodes.forEach(n => doc.insertBefore(n, first));
    afterChange(true); workspace.scrollTop = 0; B.setCaret(nodes[0], true);
  }
  bindPanel($('#btnCover'), simpleMenu([['Thesis title page', '', () => insCover('thesis')], ['Simple title page', '', () => insCover('simple')]]));
  on($('#btnBlank'), 'click', insBlankPage);
  on($('#btnPageBreak'), 'click', insPageBreak);

  /* ---------- pictures (shrunk first, so the autosave stays small) ---------- */
  function loadImage(file) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return showToast('Choose a PNG, JPEG, GIF or WebP picture', 'warn');
    if (file.size > 15 * 1024 * 1024) return showToast('That picture is too large (max 15 MB)', 'warn');
    createImageBitmap(file).then(bmp => {
      const k = Math.min(1, 1500 / bmp.width), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
      const g = cv.getContext('2d');
      if (file.type !== 'image/png') { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); }
      g.drawImage(bmp, 0, 0, cv.width, cv.height);
      let url = file.type === 'image/png' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.88);
      if (url.length > 1800000) url = cv.toDataURL('image/jpeg', 0.8);
      const img = el('img', 'eq-img'); img.src = url; img.alt = file.name.slice(0, 80); img.style.width = '70%';
      const p = el('p', 'eq-figure'); p.appendChild(img);
      const tail = B.insertBlock(p);
      afterChange(true); B.setCaret(tail, false);
      if (serialize().length > 4000000) showToast('The document is getting large. Too many pictures may stop auto-save.', 'warn');
    }).catch(e => { reportError('picture', e); showToast('Could not open that picture', 'error'); });
  }
  on($('#btnPicture'), 'click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp';
    inp.addEventListener('change', () => { if (inp.files && inp.files[0]) loadImage(inp.files[0]); });
    inp.click();
  });

  const ibar = el('div', 'obj-bar no-focus-steal');
  [['25', '25%'], ['50', '50%'], ['75', '75%'], ['100', '100%'], ['cap', 'Caption'], ['del', 'Delete']].forEach(([a, t]) => {
    const b = el('button', a === 'del' ? 'danger' : (a === 'cap' ? 'primary' : ''), t); b.type = 'button'; b.dataset.act = a; ibar.appendChild(b);
  });
  document.body.appendChild(ibar);
  let hoverImg = null, hideT = 0;
  function placeIbar() {
    if (!hoverImg || !document.contains(hoverImg)) return ibar.classList.remove('show');
    const r = hoverImg.getBoundingClientRect(), w = workspace.getBoundingClientRect();
    if (r.bottom < w.top + 10 || r.top > w.bottom - 10) return ibar.classList.remove('show');
    ibar.classList.add('show');
    ibar.style.left = Math.max(w.left + 4, r.right - ibar.offsetWidth - 8) + 'px';
    ibar.style.top = Math.max(w.top + 4, r.top + 8) + 'px';
  }
  const hideLater = () => { clearTimeout(hideT); hideT = setTimeout(() => { ibar.classList.remove('show'); hoverImg = null; }, 350); };
  doc.addEventListener('mouseover', e => { if (e.target.matches && e.target.matches('img.eq-img')) { hoverImg = e.target; clearTimeout(hideT); placeIbar(); } });
  doc.addEventListener('mouseout', e => { if (e.target.matches && e.target.matches('img.eq-img')) { const to = e.relatedTarget; if (!(to && to.closest && to.closest('.obj-bar'))) hideLater(); } });
  ibar.addEventListener('mouseenter', () => clearTimeout(hideT));
  ibar.addEventListener('mouseleave', hideLater);
  on(ibar, 'click', e => {
    const b = e.target.closest('button'); if (!b || !hoverImg) return;
    const img = hoverImg, p = img.closest('p');
    if (/^\d+$/.test(b.dataset.act)) { img.style.width = b.dataset.act + '%'; afterChange(true); placeIbar(); }
    else if (b.dataset.act === 'cap') { ibar.classList.remove('show'); if (window.eqInsertCaption) window.eqInsertCaption('figure', p); }
    else if (b.dataset.act === 'del') { ibar.classList.remove('show'); hoverImg = null; (p || img).remove(); if (!doc.children.length) doc.innerHTML = '<p><br></p>'; afterChange(true); showToast('Picture deleted. Press Ctrl+Z to undo', 'warn'); }
  });
  on(workspace, 'scroll', placeIbar);

  /* ---------- link ---------- */
  function insLink() {
    const s = getSelection(), txt = (s.rangeCount && !s.isCollapsed && doc.contains(s.anchorNode)) ? s.toString() : '';
    eqUI.form('Insert Link', [
      { id: 'text', label: 'Text to display', value: txt },
      { id: 'url', label: 'Address', value: '', placeholder: 'https://example.com' }
    ], v => {
      let url = v.url.trim();
      if (url && !/^(https?:\/\/|mailto:)/i.test(url)) url = /@/.test(url) ? 'mailto:' + url : 'https://' + url;
      if (!/^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(url)) { showToast('Enter a valid address', 'warn'); return false; }
      eqRestoreSel();
      document.execCommand('insertHTML', false, '<a href="' + url.replace(/"/g, '&quot;') + '">' + esc(v.text || url) + '</a>&nbsp;');
      afterChange(true);
    });
  }
  on($('#btnLink'), 'click', insLink);
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); insLink(); } });

  /* ---------- date & symbol ---------- */
  const insText = t => { eqRestoreSel(); document.execCommand('insertText', false, t); afterChange(true); };
  bindPanel($('#btnDate'), () => {
    const d = new Date(), L = 'en-GB';
    const f = [d.toLocaleDateString(L, { day: 'numeric', month: 'long', year: 'numeric' }), d.toLocaleDateString(L), d.toLocaleDateString('en-US'),
      d.toLocaleDateString(L, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), d.toLocaleString(L)];
    return simpleMenu(f.map(t => [t, '', () => insText(t)]));
  });
  const SYMS = '© ® ™ § ¶ † ‡ • … – — ‘ ’ “ ” « » ° ± × ÷ ≠ ≈ ≤ ≥ ∞ ½ ¼ ¾ µ α β γ δ ε θ λ π σ φ ω Δ Σ Ω ← → ↑ ↓ ↔ ✓ ✗ № ¢ £ € ¥'.split(' ');
  bindPanel($('#btnSymbol'), () => {
    const p = el('div', 'dropdown-panel no-focus-steal'); p.style.padding = '10px'; p.style.minWidth = '0';
    const g = el('div', 'symg');
    SYMS.forEach(ch => { const b = el('button', 'sym', ch); b.type = 'button'; b.addEventListener('click', () => { closeAllDropdowns(); insText(ch); }); g.appendChild(b); });
    p.appendChild(g); return p;
  });
  on($('#btnInsEq'), 'click', () => createEquation(''));

  /* ---------- header, footer, page numbers ---------- */
  const HF_DEF = { header: '', hAlign: 'right', footer: '', fAlign: 'left', numPos: 'none', numFmt: 'arabic', start: 1, first: false };
  let hf = Object.assign({}, HF_DEF, readJson('eqHF', {}));
  const roman = n => { let s = ''; [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']].forEach(([v, r]) => { while (n >= v) { s += r; n -= v; } }); return s; };
  const label = i => { const n = (parseInt(hf.start, 10) || 1) + i; if (hf.numFmt === 'lroman' && n > 0) return roman(n); if (hf.numFmt === 'uroman' && n > 0) return roman(n).toUpperCase(); return String(n); };
  const expand = (t, i, total) => esc(t).replace(/\{page\}/g, label(i)).replace(/\{pages\}/g, total).replace(/\{date\}/g, today());
  function rowsFor(i, total) {
    if (hf.first && i === 0) return { h: '', f: '' };
    const S = { h: { l: '', c: '', r: '' }, f: { l: '', c: '', r: '' } };
    const put = (row, slot, html) => { if (html) S[row][slot] = S[row][slot] ? S[row][slot] + ' &nbsp; ' + html : html; };
    const slot = a => ({ left: 'l', center: 'c', right: 'r' }[a] || 'r');
    put('h', slot(hf.hAlign), expand(hf.header, i, total));
    put('f', slot(hf.fAlign), expand(hf.footer, i, total));
    const np = { bl: ['f', 'l'], bc: ['f', 'c'], br: ['f', 'r'], tl: ['h', 'l'], tc: ['h', 'c'], tr: ['h', 'r'] }[hf.numPos];
    if (np) put(np[0], np[1], label(i));
    const row = (k, o, style) => (o.l || o.c || o.r) ? '<div class="sheet-hf ' + k + '"' + (style ? ' style="' + style + '"' : '') + '><span class="l">' + o.l + '</span><span class="c">' + o.c + '</span><span class="r">' + o.r + '</span></div>' : '';
    return { row, S, h: row('h', S.h, ''), f: row('f', S.f, '') };
  }
  function renderDeco() {
    const sheets = $$('#sheetBg .sheet'), total = typeof pageCount === 'number' ? pageCount : sheets.length;
    sheets.forEach((s, i) => {
      $$('.sheet-hf', s).forEach(x => x.remove());
      const r = rowsFor(i, total);
      if (r.h || r.f) s.insertAdjacentHTML('beforeend', r.h + r.f);
    });
  }
  const baseBuild = window.buildSheets;
  window.buildSheets = function (g) { baseBuild(g); renderDeco(); };
  window.eqRenderPrintDeco = function (n, g) {
    const box = $('#printDeco'); if (!box) return;
    let html = '';
    for (let i = 0; i < n; i++) {
      const r = rowsFor(i, n);
      if (!r.S) continue;
      html += r.row('h pd', r.S.h, 'top:' + (i * g.H + 40) + 'px;bottom:auto') + r.row('f pd', r.S.f, 'top:' + (i * g.H + g.H - 56) + 'px;bottom:auto');
    }
    box.innerHTML = html;
  };
  window.eqClearPrintDeco = function () { const b = $('#printDeco'); if (b) b.innerHTML = ''; };

  function openHF() {
    eqUI.form('Header & Footer', [
      { id: 'header', label: 'Header text', value: hf.header, placeholder: 'e.g. Thesis title', hint: 'You can use {page}, {pages} and {date}' },
      { id: 'hAlign', label: 'Header position', type: 'select', value: hf.hAlign, options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
      { id: 'footer', label: 'Footer text', value: hf.footer, placeholder: 'e.g. University name' },
      { id: 'fAlign', label: 'Footer position', type: 'select', value: hf.fAlign, options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
      { id: 'numPos', label: 'Page number', type: 'select', value: hf.numPos, options: [['none', 'None'], ['bc', 'Bottom center'], ['br', 'Bottom right'], ['bl', 'Bottom left'], ['tr', 'Top right'], ['tc', 'Top center'], ['tl', 'Top left']] },
      { id: 'numFmt', label: 'Number format', type: 'select', value: hf.numFmt, options: [['arabic', '1, 2, 3'], ['lroman', 'i, ii, iii'], ['uroman', 'I, II, III']] },
      { id: 'start', label: 'Start numbering at', type: 'number', value: hf.start, min: 1 },
      { id: 'first', label: 'Different first page (no header, footer or number on the cover)', type: 'checkbox', value: hf.first }
    ], v => {
      hf = { header: v.header, hAlign: v.hAlign, footer: v.footer, fAlign: v.fAlign, numPos: v.numPos, numFmt: v.numFmt, start: Math.max(1, parseInt(v.start, 10) || 1), first: !!v.first };
      store.set('eqHF', JSON.stringify(hf)); renderDeco(); showToast('Header and footer saved');
    }, { width: '420px', okText: 'Save' });
  }
  on($('#btnHF'), 'click', openHF);
  const setNum = pos => { hf.numPos = pos; store.set('eqHF', JSON.stringify(hf)); renderDeco(); };
  bindPanel($('#btnPageNum'), simpleMenu([
    ['Bottom center', '', () => setNum('bc')], ['Bottom right', '', () => setNum('br')], ['Top right', '', () => setNum('tr')],
    ['Remove page numbers', '', () => setNum('none')], ['Format page numbers…', '', openHF]
  ]));
  renderDeco();
})();