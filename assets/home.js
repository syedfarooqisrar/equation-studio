/* 📁 FILE: assets/home.js
   Word-style Home tab: Clipboard, Font, Paragraph, Styles, Editing (Find / Replace). Also shared helpers:
   window.eqIco / eqEsc / eqEl / eqRestoreSel / eqUI.form.
   Uses globals from app.js: doc, root, savedRange, $, $$, on, guard, store, showToast, afterChange,
   bindPanel, simpleMenu, closeAllDropdowns. */
'use strict';
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ---------- icons ---------- */
  const IC = {
    paste: '<path d="M9 3h6v4H9z"/><path d="M15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>',
    cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    painter: '<path d="M18 3l3 3-9 9-3-3z"/><path d="M9 12l-4 1c-1 3-2 4-3 5 3 1 6 0 7-3z"/>',
    grow: '<path d="M3 19L9 5l6 14M5 14h8"/><path d="M19 10V4M16.5 6.5L19 4l2.5 2.5"/>',
    shrink: '<path d="M3 19L9 5l6 14M5 14h8"/><path d="M19 4v6M16.5 7.5L19 10l2.5-2.5"/>',
    cs: '<path d="M2 18L7 6l5 12M4 14h6"/><path d="M14 18v-6a3 3 0 0 1 6 0v6M14 15h6"/>',
    clearfmt: '<path d="M4 20h8M7 4h12M13 4L9 20"/><path d="M16 14l5 5M21 14l-5 5"/>',
    highlight: '<path d="M5 17l9-9 4 4-9 9H5z"/><path d="M14 8l-2-2"/>',
    indent: '<path d="M3 6h18M11 12h10M11 18h10M3 9l3 3-3 3"/>',
    outdent: '<path d="M3 6h18M11 12h10M11 18h10M6 9l-3 3 3 3"/>',
    spacing: '<path d="M10 6h11M10 12h11M10 18h11M5 4v16M3 6l2-2 2 2M3 18l2 2 2-2"/>',
    bullets: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    numbers: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M3 5h2v4M3 15h3l-3 3h3"/>',
    alignL: '<path d="M3 6h18M3 12h12M3 18h18"/>',
    alignC: '<path d="M3 6h18M7 12h10M3 18h18"/>',
    alignR: '<path d="M3 6h18M9 12h12M3 18h18"/>',
    alignJ: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    find: '<circle cx="11" cy="11" r="6"/><path d="M21 21l-5-5"/>',
    replace: '<path d="M4 7h12l-3-3M20 17H8l3 3"/>',
    selectall: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M8 12h8"/>',
    pagebreak: '<path d="M5 3v6h14V3M5 21v-6h14v6"/><path d="M2 12h3M9 12h2M13 12h2M19 12h3"/>',
    cover: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    blank: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    picture: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    omega: '<path d="M5 20h4v-2a7 7 0 1 1 6 0v2h4"/>',
    header: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 8h16"/>',
    pagenum: '<path d="M7 3h10v18H7z"/><path d="M10 17h4"/>',
    toc: '<path d="M4 6h16M4 11h16M4 16h10M17 16h3"/>',
    caption: '<rect x="3" y="4" width="18" height="11" rx="1.5"/><path d="M6 19h12"/>',
    xref: '<path d="M9 5H5v14h4M15 5h4v14h-4"/><path d="M12 9v6M9 12h6"/>',
    cite: '<path d="M7 7h4v4H7zM13 7h4v4h-4z"/><path d="M7 11c0 3-1 4-3 5M13 11c0 3-1 4-3 5"/>',
    bib: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 8h6M8 12h6"/>',
    sources: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    update: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
    para: '<path d="M13 4v16M17 4v16M13 4H9a4 4 0 0 0 0 8h4"/>',
    eq: '<path d="M5 9h14M5 15h14"/>'
  };
  const ico = (n, s) => '<svg viewBox="0 0 24 24" width="' + (s || 16) + '" height="' + (s || 16) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
  window.eqIco = ico; window.eqEsc = esc; window.eqEl = el;
  $$('[data-i]').forEach(e => { e.innerHTML = ico(e.dataset.i, +e.dataset.s || 16); e.style.display = 'grid'; });

  /* ---------- selection helpers ---------- */
  function restoreSel() {
    doc.focus();
    if (savedRange && doc.contains(savedRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange.cloneRange()); }
    document.execCommand('styleWithCSS', false, true);
  }
  window.eqRestoreSel = restoreSel;
  const act = fn => guard(function () { restoreSel(); fn.apply(null, arguments); afterChange(true); syncUi(); }, 'home');
  const rafOnce = fn => { let t = 0; return () => { cancelAnimationFrame(t); t = requestAnimationFrame(fn); }; };
  const caretEl = () => { const s = getSelection(); let n = s.focusNode; return n ? (n.nodeType === 1 ? n : n.parentElement) : null; };

  function selBlocks() {
    const s = getSelection();
    const r = (s.rangeCount && doc.contains(s.anchorNode)) ? s.getRangeAt(0) : (savedRange && doc.contains(savedRange.startContainer) ? savedRange : null);
    if (!r) return [];
    const out = [...doc.children].filter(c => /^(P|H1|H2|H3|UL|OL)$/.test(c.tagName) && r.intersectsNode(c));
    const n = r.startContainer, e = n.nodeType === 1 ? n : n.parentElement, td = e && e.closest && e.closest('td,th');
    if (td && doc.contains(td)) out.push(td);
    return out;
  }
  const topBlock = () => { let n = caretEl(); while (n && n.parentNode !== doc) n = n.parentNode; return n; };

  /* ---------- a small form dialog used by Insert / References ---------- */
  window.eqUI = {
    form(title, fields, onOk, opts) {
      const ov = el('div', 'eqmodal open'), card = el('div', 'eqmodal-card');
      card.style.width = (opts && opts.width) || '380px';
      card.appendChild(el('h3', '', esc(title)));
      const ctl = {};
      fields.forEach(f => {
        let wrap, inp;
        if (f.type === 'checkbox') {
          wrap = el('label', 'fld-check'); inp = el('input'); inp.type = 'checkbox'; inp.checked = !!f.value;
          wrap.appendChild(inp); wrap.appendChild(document.createTextNode(' ' + f.label));
        } else {
          wrap = el('div', 'fld'); wrap.appendChild(el('span', '', esc(f.label)));
          if (f.type === 'select') { inp = el('select'); f.options.forEach(o => { const op = el('option'); op.value = o[0]; op.textContent = o[1]; inp.appendChild(op); }); inp.value = f.value; }
          else if (f.type === 'textarea') { inp = el('textarea'); inp.rows = f.rows || 3; inp.value = f.value || ''; }
          else { inp = el('input'); inp.type = f.type || 'text'; inp.value = f.value == null ? '' : f.value; if (f.min != null) inp.min = f.min; }
          if (f.placeholder) inp.placeholder = f.placeholder;
          wrap.appendChild(inp);
        }
        if (f.hint) wrap.appendChild(el('small', 'fld-hint', esc(f.hint)));
        ctl[f.id] = inp; card.appendChild(wrap);
      });
      const actions = el('div', 'eqmodal-actions'), cancel = el('button', 'btn', 'Cancel'), ok = el('button', 'btn btn-primary', esc((opts && opts.okText) || 'OK'));
      cancel.type = 'button'; ok.type = 'button';
      actions.appendChild(cancel); actions.appendChild(ok); card.appendChild(actions); ov.appendChild(card);
      const close = () => ov.remove();
      const submit = () => { const v = {}; fields.forEach(f => { const c = ctl[f.id]; v[f.id] = f.type === 'checkbox' ? c.checked : c.value; }); if (onOk(v) !== false) close(); };
      cancel.addEventListener('click', close); ok.addEventListener('click', submit);
      ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
      ov.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); }
      });
      document.body.appendChild(ov);
      const first = card.querySelector('input,textarea,select'); if (first) setTimeout(() => first.focus(), 20);
    }
  };

  /* ---------- Clipboard ---------- */
  on($('#btnCut'), 'click', act(() => document.execCommand('cut')));
  on($('#btnCopy'), 'click', act(() => document.execCommand('copy')));
  on($('#btnPaste'), 'click', act(() => { if (!document.execCommand('paste')) showToast('Use Ctrl+V to paste', 'warn'); }));

  /* ---------- Font ---------- */
  const FONTS = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Garamond', 'Book Antiqua', 'Palatino Linotype', 'Century Schoolbook', 'Courier New', 'Consolas', 'Segoe UI', 'Verdana', 'Tahoma', 'Trebuchet MS'];
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72];
  const selFont = $('#selFont'), selSize = $('#selSize');
  FONTS.forEach(f => { const o = el('option'); o.value = f; o.textContent = f; selFont.appendChild(o); });
  SIZES.forEach(s => { const o = el('option'); o.value = s; o.textContent = s; selSize.appendChild(o); });
  const ensureOpt = (sel, v) => { if (![...sel.options].some(o => o.value === v)) { const o = el('option'); o.value = v; o.textContent = v; sel.appendChild(o); } };

  function typingSpan(css) {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0), sp = el('span'), t = document.createTextNode('\u200B');
    sp.style.cssText = css; sp.appendChild(t); r.insertNode(sp);
    const nr = document.createRange(); nr.setStart(t, 1); nr.collapse(true); s.removeAllRanges(); s.addRange(nr);
  }
  function setFontPt(pt) {
    const s = getSelection(); if (!s.rangeCount) return;
    if (s.isCollapsed) { typingSpan('font-size:' + pt + 'pt'); return; }
    document.execCommand('fontSize', false, '7');
    $$('span', doc).forEach(sp => { if (sp.style.fontSize === 'xxx-large') sp.style.fontSize = pt + 'pt'; });
    $$('font[size="7"]', doc).forEach(f => { const sp = el('span'); sp.style.fontSize = pt + 'pt'; while (f.firstChild) sp.appendChild(f.firstChild); f.replaceWith(sp); });
  }
  const curPt = () => { const e = caretEl(); return e ? Math.round(parseFloat(getComputedStyle(e).fontSize) * 0.75 * 2) / 2 : 12; };
  on(selFont, 'change', act(() => document.execCommand('fontName', false, selFont.value)));
  on(selSize, 'change', act(() => setFontPt(parseFloat(selSize.value))));
  on($('#btnGrow'), 'click', act(() => { const c = curPt(); setFontPt(SIZES.find(x => x > c) || c); }));
  on($('#btnShrink'), 'click', act(() => { const c = curPt(); setFontPt([...SIZES].reverse().find(x => x < c) || c); }));
  on(doc, 'keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.key === ']') { e.preventDefault(); act(() => { const c = curPt(); setFontPt(SIZES.find(x => x > c) || c); })(); }
    else if (e.key === '[') { e.preventDefault(); act(() => { const c = curPt(); setFontPt([...SIZES].reverse().find(x => x < c) || c); })(); }
  });

  function mapText(fn) {                                 // change the text of the selection, keeping its formatting
    const s = getSelection(); if (!s.rangeCount || s.isCollapsed) return;
    const r = s.getRangeAt(0), sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
    const root0 = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    const w = document.createTreeWalker(root0, NodeFilter.SHOW_TEXT), nodes = [];
    while (w.nextNode()) { const n = w.currentNode; if (r.intersectsNode(n) && !(n.parentElement && n.parentElement.closest('math-field'))) nodes.push(n); }
    nodes.forEach(n => {
      const a = n === sc ? so : 0, b = n === ec ? eo : n.nodeValue.length, v = n.nodeValue;
      n.nodeValue = v.slice(0, a) + fn(v.slice(a, b)) + v.slice(b);
    });
    const nr = document.createRange(); nr.setStart(sc, so); nr.setEnd(ec, eo); s.removeAllRanges(); s.addRange(nr);
  }
  const caseFns = {
    upper: t => t.toUpperCase(), lower: t => t.toLowerCase(),
    title: t => t.toLowerCase().replace(/(^|[\s(\-"'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()),
    sentence: t => t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()),
    toggle: t => [...t].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('')
  };
  bindPanel($('#btnCase'), simpleMenu([
    ['Sentence case.', '', () => act(() => mapText(caseFns.sentence))()],
    ['lowercase', '', () => act(() => mapText(caseFns.lower))()],
    ['UPPERCASE', '', () => act(() => mapText(caseFns.upper))()],
    ['Capitalize Each Word', '', () => act(() => mapText(caseFns.title))()],
    ['tOGGLE cASE', '', () => act(() => mapText(caseFns.toggle))()]
  ]));

  const COLORS = ['#000000', '#434343', '#7f7f7f', '#bfbfbf', '#ffffff', '#c00000', '#ff0000', '#ed7d31', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#4472c4', '#002060', '#7030a0'];
  function palette(kind) {
    const panel = el('div', 'dropdown-panel no-focus-steal'); panel.style.padding = '10px'; panel.style.minWidth = '0';
    const g = el('div', 'pal'), cmd = kind === 'hi' ? 'hiliteColor' : 'foreColor', bar = $(kind === 'hi' ? '#hiBar' : '#fcBar');
    const apply = c => { closeAllDropdowns(); act(() => { document.execCommand(cmd, false, c); if (bar) bar.style.background = c === 'transparent' ? 'var(--faint)' : c; })(); };
    COLORS.forEach(c => { const b = el('button', 'pc'); b.type = 'button'; b.style.background = c; b.title = c; b.addEventListener('click', () => apply(c)); g.appendChild(b); });
    panel.appendChild(g);
    if (kind === 'hi') { const n = el('button', 'tbtn pal-none', 'No highlight'); n.type = 'button'; n.addEventListener('click', () => apply('transparent')); panel.appendChild(n); }
    return panel;
  }
  bindPanel($('#btnHilite'), () => palette('hi'));
  bindPanel($('#btnColor'), () => palette('fc'));

  /* ---------- Paragraph ---------- */
  const inList = () => { const e = caretEl(); return !!(e && e.closest && e.closest('li')); };
  function indent(d) {
    if (inList()) { document.execCommand(d > 0 ? 'indent' : 'outdent'); return; }
    selBlocks().forEach(b => {
      const v = Math.max(0, (parseInt(b.style.marginLeft, 10) || 0) + d * 48);
      if (v) b.style.marginLeft = v + 'px'; else b.style.removeProperty('margin-left');
      if (!b.getAttribute('style')) b.removeAttribute('style');
    });
  }
  on($('#btnIndent'), 'click', act(() => indent(1)));
  on($('#btnOutdent'), 'click', act(() => indent(-1)));
  const setLH = v => selBlocks().forEach(b => { b.style.lineHeight = v; });
  bindPanel($('#btnSpacing'), simpleMenu(['1.0', '1.15', '1.5', '2.0', '2.5', '3.0'].map(v => [v, '', () => act(() => setLH(v))()])));
  on($('#btnMarks'), 'click', () => { const on_ = root.classList.toggle('marks'); $('#btnMarks').classList.toggle('on', on_); });

  /* ---------- Format Painter ---------- */
  let painter = null;
  function wrapTextNodes(r, css) {
    const sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
    const rt = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    const w = document.createTreeWalker(rt, NodeFilter.SHOW_TEXT), nodes = [];
    while (w.nextNode()) { const n = w.currentNode; if (r.intersectsNode(n) && !(n.parentElement && n.parentElement.closest('math-field'))) nodes.push(n); }
    nodes.forEach(n => {
      let t = n;
      if (n === ec && eo < n.length) n.splitText(eo);
      if (n === sc && so > 0) t = n.splitText(so);
      if (!t.nodeValue.trim()) return;
      const sp = el('span'); sp.style.cssText = css; t.replaceWith(sp); sp.appendChild(t);
    });
  }
  on($('#btnPainter'), 'click', () => {
    const e = caretEl();
    if (!e || !doc.contains(e)) return showToast('Click the formatted text first', 'warn');
    const cs = getComputedStyle(e);
    painter = ['font-family:' + cs.fontFamily, 'font-size:' + cs.fontSize, 'font-weight:' + cs.fontWeight, 'font-style:' + cs.fontStyle, 'color:' + cs.color].join(';');
    $('#btnPainter').classList.add('on');
    showToast('Format Painter: now select the text to format');
  });
  document.addEventListener('mouseup', guard(() => {
    if (!painter) return;
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed || !doc.contains(s.anchorNode)) return;
    wrapTextNodes(s.getRangeAt(0), painter);
    painter = null; $('#btnPainter').classList.remove('on'); afterChange(true);
  }, 'painter'));

  /* ---------- Styles ---------- */
  const STYLES = [
    { id: 'normal', name: 'Normal', tag: 'P', cls: '', css: '' },
    { id: 'nospace', name: 'No Spacing', tag: 'P', cls: 'eq-nospace', css: '' },
    { id: 'h1', name: 'Heading 1', tag: 'H1', css: 'font-size:17px;font-weight:700' },
    { id: 'h2', name: 'Heading 2', tag: 'H2', css: 'font-size:15px;font-weight:700' },
    { id: 'h3', name: 'Heading 3', tag: 'H3', css: 'font-size:13px;font-weight:700;font-style:italic' },
    { id: 'title', name: 'Title', tag: 'P', cls: 'eq-title', css: 'font-size:20px;font-weight:700' },
    { id: 'subtitle', name: 'Subtitle', tag: 'P', cls: 'eq-subtitle', css: 'font-size:14px;color:#666' },
    { id: 'quote', name: 'Quote', tag: 'P', cls: 'eq-quote', css: 'font-style:italic' },
    { id: 'caption', name: 'Caption', tag: 'P', cls: 'eq-caption', css: 'font-size:11px' }
  ];
  const STYLE_CLS = ['eq-nospace', 'eq-title', 'eq-subtitle', 'eq-quote', 'eq-caption'];
  const gallery = $('#styleGallery');
  STYLES.forEach(st => {
    const c = el('button', 'sc'); c.type = 'button'; c.dataset.id = st.id; c.title = st.name;
    c.innerHTML = '<span class="sa" style="' + st.css + '">AaBbCc</span><span class="sn">' + st.name + '</span>';
    on(c, 'click', act(() => applyStyle(st)));
    gallery.appendChild(c);
  });
  function applyStyle(st) {
    document.execCommand('formatBlock', false, st.tag);
    selBlocks().forEach(b => {
      if (!/^(P|H1|H2|H3)$/.test(b.tagName)) return;
      STYLE_CLS.forEach(k => b.classList.remove(k));
      if (st.cls) b.classList.add(st.cls);
      if (!b.getAttribute('class')) b.removeAttribute('class');
      if (!/^(eq-caption)$/.test(st.cls || '')) { b.removeAttribute('data-cap'); }
    });
  }
  function styleOf(b) {
    if (!b) return 'normal';
    if (/^H[1-3]$/.test(b.tagName)) return b.tagName.toLowerCase();
    const k = STYLES.find(s => s.cls && b.classList.contains(s.cls));
    return k ? k.id : 'normal';
  }
  /* a new line after a Title / Subtitle / Caption / Heading goes back to Normal (like Word) */
  on(doc, 'input', e => {
    if (e.inputType !== 'insertParagraph') return;
    const b = topBlock(), prev = b && b.previousElementSibling;
    if (!b || !prev || b.tagName !== prev.tagName) return;
    if (/eq-(title|subtitle|caption)/.test(prev.className) && b.className === prev.className) { b.removeAttribute('class'); b.removeAttribute('data-cap'); b.removeAttribute('data-id'); }
    else if (/^H[1-3]$/.test(b.tagName)) { document.execCommand('formatBlock', false, 'P'); const nb = topBlock(); if (nb) { nb.removeAttribute('class'); nb.removeAttribute('data-id'); } }
  });

  /* ---------- keep the controls in step with the caret ---------- */
  function syncUi() {
    try {
      const s = getSelection();
      if (!s.rangeCount || !doc.contains(s.anchorNode)) return;
      const e = caretEl(); if (!e) return;
      const cs = getComputedStyle(e), pt = String(Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2);
      ensureOpt(selSize, pt); selSize.value = pt;
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      ensureOpt(selFont, fam); selFont.value = fam;
      const sid = styleOf(topBlock());
      $$('.sc', gallery).forEach(c => c.classList.toggle('active', c.dataset.id === sid));
    } catch (err) { /* cosmetic only */ }
  }
  document.addEventListener('selectionchange', rafOnce(syncUi));

  /* ---------- Editing: Find / Replace / Select all ---------- */
  const fb = $('#findBar'), fbFind = $('#fbFind'), fbRep = $('#fbRep'), fbCount = $('#fbCount'), fbCase = $('#fbCase');
  let matches = [], cur = -1;
  const hl = () => window.CSS && CSS.highlights && window.Highlight;
  function paint() {
    fbCount.textContent = matches.length ? (cur + 1) + ' of ' + matches.length : (fbFind.value ? 'No results' : '');
    if (!hl()) return;
    if (matches.length) CSS.highlights.set('eqfind', new Highlight(...matches)); else CSS.highlights.delete('eqfind');
    if (matches[cur]) CSS.highlights.set('eqfind-cur', new Highlight(matches[cur])); else CSS.highlights.delete('eqfind-cur');
  }
  function collect() {
    matches = [];
    const q = fbFind.value;
    if (q) {
      const cs = fbCase.checked, needle = cs ? q : q.toLowerCase();
      const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement && n.parentElement.closest('math-field,.eq-toc,.eq-bib,canvas')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      while (w.nextNode()) {
        const n = w.currentNode, hay = cs ? n.nodeValue : n.nodeValue.toLowerCase();
        let i = 0;
        while ((i = hay.indexOf(needle, i)) !== -1) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + q.length); matches.push(r); i += q.length; }
      }
    }
    if (cur >= matches.length) cur = matches.length - 1;
    if (cur < 0 && matches.length) cur = 0;
    paint();
  }
  function go(step) {
    if (!matches.length) return;
    cur = (cur + step + matches.length) % matches.length; paint();
    const e = matches[cur].startContainer.parentElement; if (e) e.scrollIntoView({ block: 'center' });
  }
  function replaceAt(r) {
    doc.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertText', false, fbRep.value);
  }
  function openFind(withReplace) {
    fb.hidden = false; $('#fbRepRow').hidden = !withReplace;
    const s = getSelection();
    if (s.rangeCount && !s.isCollapsed && doc.contains(s.anchorNode) && s.toString().length < 80) fbFind.value = s.toString();
    collect(); fbFind.focus(); fbFind.select();
  }
  function closeFind() {
    fb.hidden = true; matches = []; cur = -1;
    if (hl()) { CSS.highlights.delete('eqfind'); CSS.highlights.delete('eqfind-cur'); }
  }
  on(fbFind, 'input', () => { cur = -1; collect(); go(0); });
  on(fbCase, 'change', () => { cur = -1; collect(); go(0); });
  on($('#fbNext'), 'click', () => go(1));
  on($('#fbPrev'), 'click', () => go(-1));
  on($('#fbClose'), 'click', closeFind);
  on($('#fbRepOne'), 'click', () => {
    if (cur < 0 || !matches[cur]) return;
    const keep = cur; replaceAt(matches[cur]); afterChange(true);
    collect(); cur = Math.min(keep, matches.length - 1); paint(); go(0);
  });
  on($('#fbRepAll'), 'click', () => {
    const list = matches.slice(); if (!list.length) return;
    for (let k = list.length - 1; k >= 0; k--) replaceAt(list[k]);
    afterChange(true); cur = -1; collect(); showToast(list.length + ' replaced');
  });
  fb.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeFind(); return; }
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
  });
  on($('#btnFind'), 'click', () => openFind(false));
  on($('#btnReplace'), 'click', () => openFind(true));
  on($('#btnSelectAll'), 'click', () => { doc.focus(); const r = document.createRange(); r.selectNodeContents(doc); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 'f') { e.preventDefault(); openFind(false); }
    else if (k === 'h') { e.preventDefault(); openFind(true); }
  });
  on(doc, 'input', () => { if (!fb.hidden && fbFind.value) { collect(); } });
  syncUi();
})();