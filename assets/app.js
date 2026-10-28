/* 📁 FILE: assets/app.js
   Equation Studio application logic.
   Sections: 0 Boot · 1 Icons · 2 State · 3 Toast · 4 Sanitizer · 5 Save/restore · 6 History
             7 Equations · 8 Text format · 9 Dropdowns · 10 Equation menus · 11 Symbols · 12 Ribbon
             13 Snippets · 14 Actions · 15 LaTeX editor · 16 Theme/zoom · 17 Pages · 18 Drawer
             19 Python bridge · 20 Shortcuts · 21 Init */
'use strict';

/* ===================== 0. Boot ===================== */
const APP_VERSION = '1.2.0';
const dbg = (...a) => { if (window.EQ_DEBUG) console.log(a.join(' ')); };   // extra logs: run  EQ_DEBUG = true  in devtools

let lastErrorToast = 0;
function reportError(where, err){
  const msg = (err && err.message) ? err.message : String(err);
  console.log('JS ERROR [' + where + ']: ' + msg);
  const now = Date.now();
  if (now - lastErrorToast > 4000){
    lastErrorToast = now;
    try { showToast('Something went wrong. Your work is saved automatically.', 'error'); } catch(e){}
  }
}
window.addEventListener('error', e => reportError('window', e.error || e.message));
window.addEventListener('unhandledrejection', e => reportError('promise', e.reason));

const guard = (fn, where) => function(...args){
  try { return fn.apply(this, args); } catch(err){ reportError(where || fn.name || 'handler', err); }
};
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const on = (el, type, fn, opts) => el.addEventListener(type, guard(fn, type), opts);
const root = document.documentElement;

/* localStorage with an in-memory fallback. set() returns false when the browser refused to store. */
const mem = {};
const store = {
  get(k){ try { const v = localStorage.getItem(k); return v === null ? (mem[k] ?? null) : v; } catch(e){ return mem[k] ?? null; } },
  set(k, v){ mem[k] = v; try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
};

/* ===================== 1. Icons ===================== */
const ICONS = {
  undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  redo:'<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12" y2="17.01"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  code:'<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
  pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  x:'<path d="M18 6L6 18M6 6l12 12"/>',
  step:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  alignL:'<path d="M3 6h18M3 12h12M3 18h18"/>',
  alignC:'<path d="M3 6h18M7 12h10M3 18h18"/>',
  alignR:'<path d="M3 6h18M9 12h12M3 18h18"/>',
  chev:'<path d="M6 9l6 6 6-6"/>',
  chevU:'<path d="M18 15l-6-6-6 6"/>',
  chevL:'<path d="M15 18l-6-6 6-6"/>',
  chevR:'<path d="M9 18l6-6-6-6"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  filePlus:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
  save:'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  print:'<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  page:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  web:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  keyboard:'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'
};
function icon(n, s = 18){
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
}
$$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon, +el.dataset.size || 18));
$$('button[title]').forEach(b => { if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.title); });
$('#appVersion').textContent = 'v' + APP_VERSION;

/* ===================== 2. State ===================== */
const doc = $('#documentArea');
const workspace = $('#workspace'), sizer = $('#pageSizer'), scaler = $('#pageScaler'), wrap = $('#docWrap');
const sheetBg = $('#sheetBg'), sheetUi = $('#sheetUi'), pgStyle = $('#pgStyle');
let activeField = null;
let savedRange = null;
const ZW = '\u200B';          // invisible caret anchor after an equation (no visible space, like Word)

/* ===================== 3. Toast ===================== */
function showToast(message, type){
  type = type || (/^error/i.test(message) ? 'error' : 'success');
  const t = $('#toastNotification');
  const ic = { success:'✓', warn:'!', error:'✕' }[type] || '✓';
  t.className = '';
  t.dataset.type = type;
  t.innerHTML = `<span class="toast-icon">${ic}</span><span></span>`;
  t.lastChild.textContent = message;
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}
window.showToast = showToast;

/* Keep keyboard focus in the document while the toolbars are used */
document.addEventListener('mousedown', e => {
  if (e.target.closest('input,textarea,select')) return;
  if (e.target.closest('.no-focus-steal')) e.preventDefault();
});
/* Only the document and text boxes get a context menu; no stray browser menus */
document.addEventListener('contextmenu', e => { if (!e.target.closest('#documentArea,textarea,input')) e.preventDefault(); });
/* A dropped file must never navigate the window away */
['dragover', 'drop'].forEach(t => window.addEventListener(t, e => {
  if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault();
}));

/* ===================== 4. Sanitizer (saved HTML is untrusted) ===================== */
const ALLOWED_TAGS = new Set(['P','BR','B','STRONG','I','EM','U','S','STRIKE','UL','OL','LI','SPAN','DIV','SUB','SUP','MATH-FIELD','TABLE','TBODY','THEAD','TR','TD','TH','CANVAS','H1','H2','H3','A','IMG']);
const STYLE_OK = new Set(['color','background-color','font-weight','font-style','text-decoration','text-decoration-line','text-align','font-family','font-size','line-height','margin-left','margin-top','margin-bottom','text-indent','width','max-width','font-variant','text-transform','letter-spacing','border-bottom','border-top','padding-bottom','padding-left','margin-right']);
function filterStyle(css){
  return css.split(';').map(d => d.trim()).filter(d => {
    const i = d.indexOf(':');
    if (i < 1) return false;
    const prop = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1).trim();
    if (!STYLE_OK.has(prop) || /url\s*\(|expression|javascript|@import/i.test(val)) return false;
    return prop === 'font-family' ? /^[\w\s,"'-]+$/.test(val) : /^[\w\s#%.,()+-]+$/.test(val);
  }).join('; ');
}
const DATA_OK = {
  'data-toc': /^(toc|figure|table)$/, 'data-bib': /^1$/, 'data-pb': /^1$/, 'data-cap': /^(figure|table)$/,
  'data-id': /^[a-z0-9]{4,12}$/, 'data-ref': /^[a-z0-9]{4,12}$/, 'data-src': /^[a-z0-9]{4,12}$/,
  'data-th': /^(theorem|lemma|proposition|corollary|definition|remark|example|proof)$/, 'data-num': /^[0-9.]{1,10}$/,
  'data-label': /^[A-Za-z0-9 .]{1,40}$/, 'data-sec': /^(arabic|lroman|uroman|none)$/, 'data-start': /^\d{1,4}$/
};
function attrOk(el, n, v){
  const t = el.tagName;
  if (n === 'value') return t === 'MATH-FIELD';
  if (n === 'class') return /^eq-[a-z0-9 -]{0,40}$/.test(v);
  if (n === 'data-chart') return t === 'DIV' && v.length < 60000;
  if (n === 'data-note') return t === 'SPAN' && v.length < 1200;
  if (n === 'contenteditable') return v === 'false' && (t === 'DIV' || t === 'SPAN');
  if (n === 'colspan' || n === 'rowspan') return /^\d{1,2}$/.test(v);
  if (n === 'href') return t === 'A' && /^(https?:\/\/|mailto:)[^\s"'<>]{1,500}$/i.test(v);
  if (n === 'src') return t === 'IMG' && v.length < 3000000 && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+\/=]+$/.test(v);
  if (n === 'alt') return t === 'IMG' && v.length < 200;
  return !!(DATA_OK[n] && DATA_OK[n].test(v));
}
function sanitizeHtml(html){
  const tpl = document.createElement('template');          // inert: nothing runs or loads while we clean it
  tpl.innerHTML = html;
  const clean = node => {
    [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) return;
      if (ch.nodeType !== 1 || !ALLOWED_TAGS.has(ch.tagName)){ ch.remove(); return; }
      [...ch.attributes].forEach(a => {
        const n = a.name.toLowerCase();
        if (n === 'style'){ const f = filterStyle(a.value); if (f) ch.setAttribute('style', f); else ch.removeAttribute('style'); }
        else if (!attrOk(ch, n, a.value)) ch.removeAttribute(a.name);
      });
      const cls = ch.getAttribute('class') || '';
      if (ch.tagName === 'MATH-FIELD' || (ch.tagName === 'DIV' && /^eq-(toc|bib|chart|abbr|symlist|notes)$/.test(cls))) ch.textContent = '';   // rebuilt after loading
      else clean(ch);
    });
  };
  clean(tpl.content);
  return tpl.innerHTML;
}

/* ===================== 5. Save / restore ===================== */
function serialize(){
  $$('math-field', doc).forEach(m => { try { m.setAttribute('value', m.getValue('latex')); } catch(e){} });
  return doc.innerHTML.replace(/\s?is-focused/g, '');
}
function restoreDoc(html, trusted){
  let src = (html && html.trim()) ? html : '';
  if (src && !trusted){
    try { src = sanitizeHtml(src); } catch(e){ reportError('sanitize', e); src = ''; }
  }
  doc.innerHTML = src || '<p><br></p>';
  if (!doc.children.length){                                // never leave loose text at the top level
    const p = document.createElement('p');
    while (doc.firstChild) p.appendChild(doc.firstChild);
    if (!p.firstChild) p.innerHTML = '<br>';
    doc.appendChild(p);
  }
  $$('math-field', doc).forEach(mf => {
    const v = mf.getAttribute('value');
    setupMathField(mf);
    if (v != null) mf.value = v;
  });
}
function loadSavedDocument(){
  for (const src of [store.get('savedDocument'), store.get('savedDocumentPrev')]){   // current, then last good copy
    if (!src) continue;
    try { restoreDoc(src, false); return; } catch(e){ reportError('restore', e); }
  }
  restoreDoc('', true);
}
function setSave(state){
  const chip = $('#saveChip');
  chip.classList.toggle('saving', state === 'saving');
  chip.classList.toggle('error', state === 'error');
  $('#saveText').textContent = { saving:'Saving…', error:'Not saved', saved:'Saved' }[state] || 'Saved';
}
let saveTimer;
function scheduleSave(){ setSave('saving'); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
function saveNow(){
  const html = serialize();
  const prev = store.get('savedDocument');
  if (prev && prev !== html && prev.length > 40) store.set('savedDocumentPrev', prev);   // keep the last good copy
  setSave(store.set('savedDocument', html) ? 'saved' : 'error');
}
window.addEventListener('beforeunload', () => { try { saveNow(); } catch(e){} });

/* Stats */
function plainText(){ return (doc.innerText || '').replace(/\u200B/g, '').replace(/\u00A0/g, ' '); }
function isEmpty(){ return !doc.querySelector('math-field,table,.eq-chart,img,.eq-toc,.eq-bib,.eq-pagebreak') && !plainText().trim(); }
function docCounts(){
  const txt = plainText();
  return { eq: $$('math-field', doc).length, words: txt.trim().split(/\s+/).filter(Boolean).length, chars: txt.replace(/\s/g, '').length };
}
function updateStats(){
  const c = docCounts();
  $('#stats').innerHTML = `<b>${c.eq}</b> equation${c.eq === 1 ? '' : 's'} · <b>${c.words}</b> word${c.words === 1 ? '' : 's'}`;
  $('#docWrap').classList.toggle('is-empty', isEmpty());
  if ($('#drawer').classList.contains('open')) refreshInfo();
}
function refreshInfo(){
  const c = docCounts();
  $('#infoPages').textContent = layout === 'print' ? pageCount : '—';
  $('#infoWords').textContent = c.words;
  $('#infoChars').textContent = c.chars;
  $('#infoEq').textContent = c.eq;
}

/* ===================== 6. Undo / redo (document level) ===================== */
let hStack = [], hIdx = -1, restoring = false, hTimer;
function pushHistory(){
  if (restoring) return;
  const s = serialize();
  if (hStack[hIdx] === s) return;
  hStack = hStack.slice(0, hIdx + 1);
  hStack.push(s);
  hIdx = hStack.length - 1;
  if (hStack.length > 100){ hStack.shift(); hIdx--; }
  updateHistoryButtons();
}
function scheduleHistory(){ clearTimeout(hTimer); hTimer = setTimeout(pushHistory, 400); }
function applySnapshot(s){ restoring = true; restoreDoc(s, true); restoring = false; afterChange(false); updateHistoryButtons(); }
function undo(){ clearTimeout(hTimer); pushHistory(); if (hIdx > 0){ hIdx--; applySnapshot(hStack[hIdx]); } }
function redo(){ if (hIdx < hStack.length - 1){ hIdx++; applySnapshot(hStack[hIdx]); } }
function updateHistoryButtons(){ $('#undoBtn').disabled = hIdx <= 0; $('#redoBtn').disabled = hIdx >= hStack.length - 1; }
function afterChange(snapshot = true){ updateStats(); scheduleSave(); schedulePaginate(); if (snapshot) scheduleHistory(); }
on(doc, 'input', () => afterChange(true));

/* ===================== 7. Equations ===================== */
function mathFieldFocusState(mf, label){
  if (!window.EQ_DEBUG) return;
  try {
    const sink = mf.shadowRoot && mf.shadowRoot.querySelector('.ML__keyboard-sink');
    const sa = mf.shadowRoot && mf.shadowRoot.activeElement;
    console.log('FOCUS-DIAG ' + JSON.stringify({ label, value: mf.getValue('latex'), selection: mf.selection && mf.selection.ranges,
      activeTag: document.activeElement && document.activeElement.tagName, focusWithin: mf.matches(':focus-within'),
      hasFocus: typeof mf.hasFocus === 'function' ? mf.hasFocus() : 'n/a', sinkFocused: !!(sink && sa === sink) }));
  } catch(e){}
}
function setupMathField(mf){
  mf.setAttribute('math-virtual-keyboard-policy', 'manual');
  on(mf, 'focusin', () => { activeField = mf; mf.classList.add('is-focused'); mathFieldFocusState(mf, 'focusin'); });
  on(mf, 'focusout', () => {
    mathFieldFocusState(mf, 'focusout');
    setTimeout(() => {
      if (document.activeElement === mf) return;
      mf.classList.remove('is-focused');
      try { if (doc.contains(mf) && !mf.getValue('latex').trim()){ mf.remove(); afterChange(true); } } catch(e){}   // drop empty equations
    }, 200);
  });
  if (window.EQ_DEBUG) mf.addEventListener('input', () => { try { console.log('INPUT ' + mf.getValue('latex')); } catch(e){} });
}
function placeAtCursor(node){
  const ae = document.activeElement;
  const sel = getSelection();
  let range;
  if (ae && ae.tagName === 'MATH-FIELD' && doc.contains(ae)){
    range = document.createRange(); range.setStartAfter(ae); range.collapse(true);
  } else if (savedRange && doc.contains(savedRange.startContainer)){
    range = savedRange.cloneRange();
  } else {
    range = document.createRange(); range.selectNodeContents(doc); range.collapse(false);
  }
  doc.focus();
  range.deleteContents();
  range.insertNode(node);
  const nx = node.nextSibling;                              // no automatic space, only a caret anchor when nothing follows
  if (!(nx && nx.nodeType === 3 && nx.data.length)) node.after(document.createTextNode(ZW));
  range.setStartAfter(node); range.collapse(true);
  sel.removeAllRanges(); sel.addRange(range);
}

/* Templates that wrap what is already there (accents, bars, boxes, font styles) */
const WRAP_RX = /^\\(dot|ddot|dddot|hat|widehat|check|acute|grave|breve|tilde|widetilde|bar|vec|mathring|overline|underline|overrightarrow|overleftarrow|overleftrightarrow|overbrace|underbrace|boxed|enclose|cancel|bcancel|xcancel|phantom|mathbf|mathit|mathrm|mathbb|mathcal|mathfrak|mathsf|mathtt|boldsymbol)\b/;

function firstRange(mf){ const rs = mf.selection && mf.selection.ranges; return (rs && rs[0]) ? rs[0] : null; }
function rangeLatex(mf, a, b){
  try { return mf.getValue(a, b, 'latex'); }
  catch(e1){ try { return mf.getValue([a, b], 'latex'); } catch(e2){ return ''; } }
}
function selectionLatex(mf){
  try { return mf.getValue(mf.selection, 'latex'); }
  catch(e){ const r = firstRange(mf); return r ? rangeLatex(mf, r[0], r[1]) : ''; }
}
function placeholderSelected(mf){
  const r = firstRange(mf);
  if (!r || r[0] === r[1]) return false;
  return /placeholder|#\?/.test(selectionLatex(mf));
}
function selectFirstPlaceholder(mf){                        // returns how it worked, or '' when it did not
  try { mf.focus(); } catch(e){}
  if (placeholderSelected(mf)) return 'already-selected';
  for (const cmd of ['moveToNextPlaceholder', 'moveToPreviousPlaceholder']){
    try { mf.executeCommand(cmd); } catch(e){}
    if (placeholderSelected(mf)) return cmd;
  }
  try {
    for (let i = 1; i <= mf.lastOffset; i++){
      mf.selection = { ranges: [[i - 1, i]], direction: 'forward' };
      if (placeholderSelected(mf)) return 'scan@' + i;
    }
  } catch(e){}
  return '';
}

function insertIntoField(mf, latex){
  const PH = '\\placeholder{}';
  const wrap = latex.indexOf('#@') !== -1 && WRAP_RX.test(latex);
  let out = latex, wrapped = '';
  if (wrap){
    try {
      let r = firstRange(mf);
      if (r && r[0] === r[1]){ mf.executeCommand('extendSelectionBackward'); r = firstRange(mf); }   // nothing selected: take the item before the caret
      if (r && r[0] !== r[1]) wrapped = selectionLatex(mf);
    } catch(e){ dbg('wrap lookup failed:', e.message); }
    out = latex.replace(/#@/g, wrapped || PH).replace(/#\?/g, PH);
    dbg('WRAP', latex, '| wrapped:', wrapped, '| sending:', out);
  }
  mf.insert(out, { format: 'latex', selectionMode: 'placeholder', focus: true });
  if (wrap && !wrapped){                                    // new empty slot: put the cursor inside it
    let tries = 0;
    const arm = () => {
      tries++;
      const how = selectFirstPlaceholder(mf);
      dbg('PH try', tries, how || 'FAILED');
      if (how) return;
      if (tries < 3){ setTimeout(arm, 60 * tries); return; }
      showToast('Click the box and type.', 'warn');
    };
    arm();
  }
  try { dbg('AFTER', mf.getValue('latex'), JSON.stringify(mf.selection && mf.selection.ranges)); } catch(e){}
}
function createEquation(latex){
  const mf = document.createElement('math-field');
  setupMathField(mf);
  placeAtCursor(mf);
  setTimeout(() => {
    try { mf.focus(); if (latex) insertIntoField(mf, latex); }
    catch(err){ reportError('insert', err); }
    afterChange(true);
  }, 60);
  return mf;
}
function insertLatex(latex){
  const ae = document.activeElement;
  const keep = activeField && doc.contains(activeField) &&
               (ae === activeField || (ae && ae.closest && ae.closest('.ribbon')));
  dbg('INSERT', latex, '| into existing equation:', !!keep);
  if (keep){
    try { insertIntoField(activeField, latex); activeField.focus(); }
    catch(err){ reportError('insert', err); }
    afterChange(true);
  } else createEquation(latex);
}
function deleteActiveEquation(){
  if (activeField && doc.contains(activeField)){
    activeField.remove(); activeField = null; afterChange(true); showToast('Equation deleted');
  } else showToast('Click an equation first', 'warn');
}
function exitEquation(){
  if (!activeField || !doc.contains(activeField)) return;
  const mf = activeField, next = mf.nextSibling, r = document.createRange();
  mf.blur(); doc.focus();
  if (next && next.nodeType === 3) r.setStart(next, next.data.charAt(0) === ZW ? 1 : 0); else r.setStartAfter(mf);
  r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

/* Backspace in the TEXT right after an equation removes the whole equation (typing inside one is MathLive's job) */
on(doc, 'keydown', e => {
  if (e.key !== 'Backspace') return;
  if (e.target && e.target.tagName === 'MATH-FIELD') return;
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return;
  const r = sel.getRangeAt(0), c = r.startContainer, o = r.startOffset;
  const SP = /^[\u00A0\u200B]$/, SP1 = /^[\u00A0\u200B]/;
  let prev = null;
  if (c.nodeType === 3){
    if (o === 0) prev = c.previousSibling;
    else if (o === 1 && SP1.test(c.textContent) && c.previousSibling && c.previousSibling.tagName === 'MATH-FIELD') prev = c.previousSibling;
  } else if (o > 0) prev = c.childNodes[o - 1];
  if (prev && prev.nodeType === 3 && SP.test(prev.textContent) && prev.previousSibling && prev.previousSibling.tagName === 'MATH-FIELD'){
    e.preventDefault(); prev.previousSibling.remove(); prev.remove(); afterChange(true); return;
  }
  if (prev && prev.tagName === 'MATH-FIELD'){
    e.preventDefault();
    const sib = c.nodeType === 3 && o === 1 ? c : null;
    prev.remove(); if (sib && SP.test(sib.textContent)) sib.remove();
    afterChange(true);
  }
});

/* Paste as plain text only */
on(doc, 'paste', e => {
  if (e.target.tagName === 'MATH-FIELD') return;
  e.preventDefault();
  const t = ((e.clipboardData || window.clipboardData).getData('text/plain') || '').slice(0, 200000);
  document.execCommand('insertText', false, t);
});

/* ===================== 8. Text formatting ===================== */
document.execCommand('defaultParagraphSeparator', false, 'p');
document.execCommand('styleWithCSS', false, true);
document.addEventListener('selectionchange', guard(() => {
  const s = getSelection();
  if (s.rangeCount && doc.contains(s.anchorNode)){ savedRange = s.getRangeAt(0).cloneRange(); updateFormatState(); }
}, 'selectionchange'));
function fmt(cmd, val){
  const ae = document.activeElement;
  if (!(ae === doc || doc.contains(ae))) doc.focus();
  document.execCommand(cmd, false, val);
  afterChange(true); updateFormatState();
}
function updateFormatState(){
  $$('[data-cmd]').forEach(b => { let o = false; try { o = document.queryCommandState(b.dataset.cmd); } catch(e){} b.classList.toggle('active', o); });
}
$$('[data-cmd]').forEach(b => on(b, 'click', () => fmt(b.dataset.cmd)));
on($('#clearFmtBtn'), 'click', () => fmt('removeFormat'));
[['Red','#e5484d'],['Blue','#3b82f6'],['Green','#22a559'],['Orange','#f08c1a'],['Purple','#8b5cf6']].forEach(([n, c]) => {
  const b = document.createElement('button');
  b.className = 'swatch'; b.title = n + ' text'; b.setAttribute('aria-label', n + ' text'); b.style.background = c;
  on(b, 'click', () => fmt('foreColor', c));
  $('#swatches').appendChild(b);
});
on($('#undoBtn'), 'click', undo);
on($('#redoBtn'), 'click', redo);

/* ===================== 9. Dropdown engine (panels are built on first open) ===================== */
function closeAllDropdowns(){
  $$('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
  $$('.is-active').forEach(b => { if (b.classList.contains('rbtn') || b.classList.contains('btn')) b.classList.remove('is-active'); });
}
on(document, 'click', closeAllDropdowns);
on(window, 'blur', closeAllDropdowns);
on(window, 'resize', closeAllDropdowns);

function positionAndOpen(panel, btn){
  const wasOpen = panel.classList.contains('open');
  closeAllDropdowns();
  if (wasOpen) return;
  if (panel.parentElement !== document.body) document.body.appendChild(panel);
  const m = 8, vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const b = btn.getBoundingClientRect();
  panel.style.maxWidth = Math.max(160, vw - m * 2) + 'px';
  panel.style.maxHeight = Math.max(120, vh - m * 2) + 'px';
  panel.style.left = '0px'; panel.style.top = '0px';
  panel.classList.add('open'); btn.classList.add('is-active');
  if (typeof panel._onOpen === 'function') setTimeout(panel._onOpen, 0);
  let p = panel.getBoundingClientRect();
  const below = vh - b.bottom - m - 6, above = b.top - m - 6;
  let top;
  if (p.height <= below) top = b.bottom + 6;
  else if (p.height <= above) top = b.top - p.height - 6;
  else if (below >= above){ panel.style.maxHeight = Math.max(120, below) + 'px'; top = b.bottom + 6; }
  else { panel.style.maxHeight = Math.max(120, above) + 'px'; p = panel.getBoundingClientRect(); top = Math.max(m, b.top - 6 - p.height); }
  p = panel.getBoundingClientRect();
  const left = Math.max(m, Math.min(b.left, vw - p.width - m));
  panel.style.left = left + 'px'; panel.style.top = top + 'px';
}
function bindPanel(btn, panelOrFn){
  let panel = (typeof panelOrFn === 'function') ? null : panelOrFn;
  if (panel) document.body.appendChild(panel);
  on(btn, 'click', e => {
    e.stopPropagation();
    if (!panel){ panel = panelOrFn(); document.body.appendChild(panel); }
    positionAndOpen(panel, btn);
  });
}
function buildGridPanel(sections, cw){
  const panel = document.createElement('div');
  panel.className = 'dropdown-panel no-focus-steal';
  sections.forEach(sec => {
    const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = sec.title; panel.appendChild(t);
    if (sec.note){ const n = document.createElement('div'); n.className = 'panel-note'; n.textContent = sec.note; panel.appendChild(n); }
    const g = document.createElement('div'); g.className = 'panel-grid';
    g.style.gridTemplateColumns = `repeat(${sec.cols || 4}, ${cw}px)`;
    sec.items.forEach(([latex, title, preview]) => {
      const it = document.createElement('div');
      it.className = 'dd-item' + (sec.labeled ? ' labeled' : '');
      it.dataset.q = ((title || '') + ' ' + latex).toLowerCase();
      if (title){ it.title = title; it.setAttribute('aria-label', title); }
      if (sec.labeled && title){ const lb = document.createElement('div'); lb.className = 'dd-label'; lb.textContent = title; it.appendChild(lb); }
      const pm = document.createElement('math-field');
      pm.setAttribute('read-only', 'true'); pm.setAttribute('math-virtual-keyboard-policy', 'manual');
      pm.value = preview; it.appendChild(pm);
      on(it, 'click', () => { closeAllDropdowns(); if (sec.newEq) createEquation(latex); else insertLatex(latex); });
      g.appendChild(it);
    });
    panel.appendChild(g);
  });
  return panel;
}

/* ===================== 10. Equation menus (data lives in equation-data.js) ===================== */
function ribbonDropdown(def){
  const btn = document.createElement('button');
  btn.className = 'rbtn dd';
  btn.title = def.label; btn.setAttribute('aria-label', def.label);
  btn.innerHTML = `<span class="ri">${def.icon}</span><span class="rl">${def.label}</span>`;
  bindPanel(btn, () => buildGridPanel(def.sections, def.cw || 84));
  return btn;
}
function ribbonGroup(name, items){
  const g = document.createElement('div'); g.className = 'rgroup';
  const row = document.createElement('div'); row.className = 'rgroup-items';
  items.forEach(i => row.appendChild(ribbonDropdown(i)));
  const l = document.createElement('div'); l.className = 'rgroup-label'; l.textContent = name;
  g.appendChild(row); g.appendChild(l);
  return g;
}
GROUPS.forEach(g => $('#equationRow').appendChild(ribbonGroup(g.name, g.items)));
function buildGalleryPanel(){
  const panel = buildGridPanel(GALLERY, 380);
  const bar = document.createElement('div'); bar.className = 'panel-search';
  const input = document.createElement('input');
  input.type = 'search'; input.placeholder = 'Search equations (quadratic, sin, area…)';
  input.setAttribute('aria-label', 'Search equations'); input.autocomplete = 'off'; input.spellcheck = false;
  bar.appendChild(input);
  const empty = document.createElement('div'); empty.className = 'panel-empty'; empty.textContent = 'No equations found.'; empty.hidden = true;
  panel.insertBefore(bar, panel.firstChild);
  panel.appendChild(empty);

  const apply = () => {
    const words = input.value.trim().toLowerCase().replace(/\\/g, '').split(/\s+/).filter(Boolean);
    let total = 0;
    $$('.dd-item', panel).forEach(it => {
      const hay = (it.dataset.q || '').replace(/\\/g, '');
      const hit = words.every(w => hay.includes(w));
      it.hidden = !hit;
      if (hit) total++;
    });
    let heading = null;
    [...panel.children].forEach(ch => {
      if (ch.classList.contains('panel-title')) heading = ch;
      else if (ch.classList.contains('panel-grid')){
        const any = ch.querySelector('.dd-item:not([hidden])');
        ch.hidden = !any;
        if (heading) heading.hidden = !any;
      }
    });
    empty.hidden = total > 0;
  };
  input.addEventListener('input', apply);
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') return;                        // let Esc close the panel
    e.stopPropagation();                                   // typing must not trigger app shortcuts
    if (e.key === 'Enter'){
      e.preventDefault();
      const first = panel.querySelector('.dd-item:not([hidden])');
      if (first) first.click();
    }
  });
  panel.addEventListener('click', e => { if (!e.target.closest('.dd-item')) e.stopPropagation(); });
  panel._onOpen = () => { input.value = ''; apply(); input.focus({ preventScroll: true }); };
  return panel;
}
bindPanel($('#galleryBtn'), buildGalleryPanel);

/* ===================== 11. Symbols tab ===================== */
let recent = [];
try { recent = JSON.parse(store.get('recentSymbols') || '[]'); if (!Array.isArray(recent)) recent = []; } catch(e){ recent = []; }
let symCat = 'Basic Math';
function addRecent(s){
  recent = [s, ...recent.filter(r => r[1] !== s[1])].slice(0, 24);
  store.set('recentSymbols', JSON.stringify(recent));
}
function renderSymbolChips(){
  const box = $('#symChips'); box.innerHTML = '';
  ['Recent', ...Object.keys(SYM)].forEach(name => {
    const b = document.createElement('button');
    b.className = 'chip-btn' + (name === symCat ? ' active' : '');
    b.textContent = name;
    on(b, 'click', () => { symCat = name; $('#symSearch').value = ''; renderSymbolChips(); renderSymbolGrid(); });
    box.appendChild(b);
  });
}
function renderSymbolGrid(){
  const q = $('#symSearch').value.trim().toLowerCase().replace(/^\\/, '');
  let list;
  if (q){
    const seen = new Set(); list = [];
    Object.values(SYM).flat().forEach(s => {
      if (seen.has(s[1])) return;
      if (s[0] === q || s[1].toLowerCase().includes(q)){ seen.add(s[1]); list.push(s); }
    });
  } else list = symCat === 'Recent' ? recent : (SYM[symCat] || []);
  const g = $('#symGrid'); g.innerHTML = '';
  if (!list.length){ g.innerHTML = `<div class="sym-empty">${q ? 'No symbols found.' : 'Symbols you use will appear here.'}</div>`; return; }
  list.forEach(s => {
    const b = document.createElement('button');
    b.className = 'sym'; b.title = s[1]; b.setAttribute('aria-label', s[1]);
    if (s[0]) b.textContent = s[0];
    else {
      const pm = document.createElement('math-field');
      pm.setAttribute('read-only', 'true'); pm.setAttribute('math-virtual-keyboard-policy', 'manual');
      pm.value = s[1]; b.appendChild(pm);
    }
    on(b, 'click', () => { insertLatex(s[1]); addRecent(s); if (symCat === 'Recent') renderSymbolGrid(); });
    g.appendChild(b);
  });
}
on($('#symSearch'), 'input', renderSymbolGrid);
renderSymbolChips(); renderSymbolGrid();

/* ===================== 12. Ribbon tabs ===================== */
function setRibbonCollapsed(c){
  $('#ribbon').classList.toggle('collapsed', c);
  $('#ribbonToggle').innerHTML = icon(c ? 'chev' : 'chevU', 16);
  store.set('ribbonCollapsed', c ? '1' : '0');
}
on($('#ribbonToggle'), 'click', () => setRibbonCollapsed(!$('#ribbon').classList.contains('collapsed')));
$$('.tab').forEach(t => on(t, 'click', () => {
  if ($('#ribbon').classList.contains('collapsed')) setRibbonCollapsed(false);
  $$('.tab').forEach(x => { const a = x === t; x.classList.toggle('active', a); x.setAttribute('aria-selected', String(a)); });
  ['home', 'insert', 'references', 'thesis', 'equation', 'symbols'].forEach(n => {
    const p = $('#tab' + n.charAt(0).toUpperCase() + n.slice(1));
    if (p) p.classList.toggle('hidden', t.dataset.tab !== n);
  });
  closeAllDropdowns();
}));

/* ===================== 13. Snippets and steps ===================== */
function ensureCaret(){
  const s = getSelection();
  if (!(s.rangeCount && doc.contains(s.anchorNode))){
    doc.focus();
    const r = document.createRange(); r.selectNodeContents(doc); r.collapse(false);
    s.removeAllRanges(); s.addRange(r);
  }
}
function insertHTMLAtCaret(html){ ensureCaret(); document.execCommand('insertHTML', false, html); afterChange(true); }
function nextStep(){
  const n = ((doc.innerText || '').match(/\bStep\s+\d+/gi) || []).length + 1;
  insertHTMLAtCaret(`<p><b>Step ${n}:</b>&nbsp;</p>`);
}
const SNIPPETS = [
  ['Given:', '<p><b>Given:</b>&nbsp;</p>', ''],
  ['Solution:', '<p><b>Solution:</b></p>', ''],
  ['Therefore,', '<p>Therefore,&nbsp;</p>', ''],
  ['Hence proved', '<p><b>Hence proved.</b></p>', ''],
  ['Answer:', '<p><b>Answer:</b>&nbsp;</p>', ''],
  ['Note:', '<p><i>Note:</i>&nbsp;</p>', ''],
  ['Full solution template', '<p><b>Given:</b>&nbsp;</p><p><b>Solution:</b></p><p><b>Step 1:</b>&nbsp;</p><p><b>Step 2:</b>&nbsp;</p><p><b>Answer:</b>&nbsp;</p>', 'template']
];
function simpleMenu(items){
  const panel = document.createElement('div');
  panel.className = 'dropdown-panel no-focus-steal';
  panel.style.minWidth = '230px'; panel.style.padding = '8px';
  items.forEach(([label, hint, fn]) => {
    const it = document.createElement('div'); it.className = 'menu-item';
    it.innerHTML = '<span></span><small></small>';
    it.firstChild.textContent = label; it.lastChild.textContent = hint;
    on(it, 'click', () => { closeAllDropdowns(); fn(); });
    panel.appendChild(it);
  });
  return panel;
}
bindPanel($('#snippetsBtn'), simpleMenu(SNIPPETS.map(([label, html, tag]) => [label, tag, () => insertHTMLAtCaret(html)])));

/* ===================== 14. Actions ===================== */
function copyText(text){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch(e){}
  ta.remove(); return ok;
}
function copyLatex(){
  const parts = $$('math-field', doc).map(m => m.getValue('latex')).filter(Boolean);
  if (!parts.length) return showToast('No equations to copy', 'warn');
  if (copyText(parts.join('\n'))) showToast(`${parts.length} equation${parts.length > 1 ? 's' : ''} copied as LaTeX`);
  else showToast('Error: could not copy LaTeX');
}
function copyMathml(){
  const fields = $$('math-field', doc);
  if (!fields.length) return showToast('No equations to copy', 'warn');
  const parts = [];
  fields.forEach(m => { try { const v = m.getValue('math-ml'); if (v) parts.push(v); } catch(e){} });
  if (!parts.length) return showToast('Error: MathML is not available', 'error');
  if (copyText(parts.join('\n'))) showToast(`${parts.length} equation${parts.length > 1 ? 's' : ''} copied as MathML`);
  else showToast('Error: could not copy MathML');
}
function clearDoc(){
  if (isEmpty()) return showToast('Document is already empty', 'warn');
  clearTimeout(hTimer); pushHistory();
  doc.innerHTML = '<p><br></p>';
  afterChange(true); pushHistory();
  showToast('Cleared. Press Ctrl+Z to undo', 'warn');
}
/* mode: 'clipboard' | 'save'; page (optional, 1-based) = capture just that page */
function takeScreenshot(mode, page){
  if (isEmpty()) return showToast('Nothing to copy yet', 'warn');
  const m = (typeof mode === 'string') ? mode : 'clipboard';
  window.pyCaptureRequest = page ? `${m}:${page}` : m;
}
function requestExport(kind){
  if (isEmpty()) return showToast('Nothing to export yet', 'warn');
  window.pyCaptureRequest = kind;                           // 'pdf' | 'print'
}
bindPanel($('#captureMenuBtn'), simpleMenu([
  ['Copy to clipboard', 'Ctrl+Shift+C', () => takeScreenshot('clipboard')],
  ['Save as PNG…', '', () => takeScreenshot('save')],
  ['Save as PDF…', '', () => requestExport('pdf')],
  ['Open Captures folder', '', () => { window.pyCaptureRequest = 'folder'; }]
]));
on($('#insertEquationBtn'), 'click', () => createEquation(''));
on($('#nextStepBtn'), 'click', nextStep);
on($('#copyLatexBtn'), 'click', copyLatex);
on($('#copyMathmlBtn'), 'click', copyMathml);
on($('#textBtn'), 'click', () => insertLatex('\\text{#?}'));
on($('#delEqBtn'), 'click', deleteActiveEquation);
on($('#clearBtn'), 'click', clearDoc);
on($('#screenshotBtn'), 'click', () => takeScreenshot('clipboard'));

/* ===================== 15. LaTeX editor ===================== */
let latexTarget = null;
function openLatexModal(){
  const ae = document.activeElement;
  latexTarget = (ae && ae.tagName === 'MATH-FIELD' && doc.contains(ae)) ? ae : null;
  let current = '';
  if (latexTarget){ try { current = latexTarget.getValue('latex'); } catch(e){} }
  $('#latexTitle').textContent = latexTarget ? 'Edit equation as LaTeX' : 'Insert equation from LaTeX';
  $('#latexApply').textContent = latexTarget ? 'Apply' : 'Insert';
  $('#latexInput').value = current;
  updateLatexPreview();
  $('#latexModal').classList.add('open');
  setTimeout(() => { const t = $('#latexInput'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, 30);
}
function closeLatexModal(){ $('#latexModal').classList.remove('open'); }
function updateLatexPreview(){
  const v = $('#latexInput').value;
  try { $('#latexPreview').value = v; } catch(e){}
  let msg = '';
  const ML = window.MathLive;
  if (v.trim() && ML && typeof ML.validateLatex === 'function'){
    try { const errs = ML.validateLatex(v); if (errs && errs.length) msg = 'Check the LaTeX: ' + (errs[0].code || 'syntax problem'); } catch(e){}
  }
  $('#latexErr').textContent = msg;
}
function applyLatex(){
  const v = $('#latexInput').value.trim();
  if (!v){ showToast('Type some LaTeX first', 'warn'); return; }
  closeLatexModal();
  if (latexTarget && doc.contains(latexTarget)){ latexTarget.value = v; latexTarget.focus(); afterChange(true); }
  else createEquation(v);
}
on($('#latexEditBtn'), 'click', openLatexModal);
on($('#latexInput'), 'input', updateLatexPreview);
on($('#latexCancel'), 'click', closeLatexModal);
on($('#latexApply'), 'click', applyLatex);
on($('#latexModal'), 'click', e => { if (e.target.id === 'latexModal') closeLatexModal(); });
on($('#latexInput'), 'keydown', e => { if (e.ctrlKey && e.key === 'Enter'){ e.preventDefault(); applyLatex(); } });

/* ===================== 16. Theme and zoom ===================== */
function applyTheme(t){
  root.dataset.theme = t;
  $('#themeBtn').innerHTML = icon(t === 'dark' ? 'sun' : 'moon', 17);
  $('#themeSwitch').classList.toggle('on', t === 'dark');
  $('#themeSwitch').setAttribute('aria-checked', String(t === 'dark'));
  store.set('theme', t);
}
const toggleTheme = () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
on($('#themeBtn'), 'click', toggleTheme);
on($('#themeSwitch'), 'click', toggleTheme);
let docSize = parseInt(store.get('docSize') || '18', 10);
if (!(docSize >= 12 && docSize <= 34)) docSize = 18;
function applyZoom(){
  docSize = Math.max(12, Math.min(34, docSize));
  root.style.setProperty('--doc-size', docSize + 'px');
  $('#zoomLabel').textContent = Math.round(docSize / 18 * 100) + '%';
  $('#zoomSlider').value = docSize;
  store.set('docSize', docSize);
  applyScale();
  updatePageIndicator();
}
on($('#zoomIn'), 'click', () => { docSize += 2; applyZoom(); });
on($('#zoomOut'), 'click', () => { docSize -= 2; applyZoom(); });
on($('#zoomSlider'), 'input', e => { docSize = parseInt(e.target.value, 10); applyZoom(); });

/* ===================== 17. Layout and pages ===================== */
const PAGE_DEF = { A4:{ w:794, h:1123 }, Letter:{ w:816, h:1056 } };   // CSS px at 96 dpi
const PAGE_M = 72, PAGE_GAP = 24;                                     // 1 inch margins, gap between pages
let layout = store.get('layoutMode') === 'web' ? 'web' : 'print';
let pageSize = store.get('pageSize') === 'Letter' ? 'Letter' : 'A4';
let pageCount = 1, pagesHeight = 0, sheetKey = '', curPage = 1;
let kidPage = [];                                                      // page (0-based) of every top-level block

function geo(){ const p = PAGE_DEF[pageSize]; return { W:p.w, H:p.h, S:p.h + PAGE_GAP }; }
function applyScale(){
  if (layout === 'print'){
    const g = geo(), s = docSize / 18, h = pagesHeight || g.H;
    wrap.style.width = g.W + 'px';
    scaler.style.width = g.W + 'px';
    scaler.style.transform = `scale(${s})`;
    sizer.style.width = (g.W * s) + 'px';
    sizer.style.height = (h * s) + 'px';
  } else {
    wrap.style.width = ''; scaler.style.width = ''; scaler.style.transform = '';
    sizer.style.width = ''; sizer.style.height = '';
  }
}
/* Whole blocks that would cross a page bottom move to the next page. gap = space between sheets on screen,
   or 0 when laying out for the PDF, so the PDF breaks at the same places as the screen. */
function layoutBlocks(gap){
  const g = geo(), S = g.H + gap;
  const kids = [...doc.children];
  const rules = [], pages = [];
  let shift = 0, prevBottom = PAGE_M, maxBottom = PAGE_M, breakPage = -1;
  kids.forEach((el, i) => {
    const h = el.offsetHeight;
    let top = el.offsetTop + shift;
    let page = Math.floor(top / S);
    const nx = kids[i + 1];
    const need = h + (/^H[1-3]$/.test(el.tagName) && nx ? Math.min(nx.offsetHeight, 70) : 0);   // a heading stays with what follows
    const pushTo = np => {
      const nt = np * S + PAGE_M;
      rules.push(`#documentArea > :nth-child(${i + 1}){margin-top:${Math.max(0, nt - prevBottom)}px}`);
      shift += nt - top; top = nt; page = np;
    };
    if (top + need > page * S + g.H - PAGE_M + 0.5 && top > page * S + PAGE_M + 0.5) pushTo(page + 1);
    if (breakPage >= 0 && page <= breakPage) pushTo(breakPage + 1);                              // after a page break
    breakPage = el.classList.contains('eq-pagebreak') ? page : -1;
    pages[i] = Math.floor(top / S);
    prevBottom = top + h;
    if (prevBottom > maxBottom) maxBottom = prevBottom;
  });
  return { rules, pages, maxBottom };
}
function paginate(){
  if (layout !== 'print'){
    pgStyle.textContent = ''; doc.style.height = '';
    pageCount = 1; pagesHeight = 0; sheetKey = ''; kidPage = [];
    applyScale(); updatePageIndicator();
    if (window.eqAfterPaginate) window.eqAfterPaginate();
    return;
  }
  const g = geo();
  pgStyle.textContent = '';                                 // measure the natural layout first
  const L = layoutBlocks(PAGE_GAP);
  kidPage = L.pages;
  pgStyle.textContent = L.rules.length ? `@media screen{${L.rules.join('')}}` : '';
  pageCount = Math.max(1, Math.floor((L.maxBottom - 1) / g.S) + 1);
  pagesHeight = pageCount * g.H + (pageCount - 1) * PAGE_GAP;
  doc.style.height = pagesHeight + 'px';
  buildSheets(g);
  applyScale();
  observeKids([...doc.children]);
  updatePageIndicator();
  if ($('#drawer').classList.contains('open')) refreshInfo();
  if (window.eqAfterPaginate) window.eqAfterPaginate();
}
/* PDF: same breaks as the screen, no gaps between pages (used by main.py before printToPdf) */
const printStyle = document.createElement('style');
document.head.appendChild(printStyle);
window.preparePrint = function(){
  if (layout !== 'print') return false;
  try {
    const g = geo();
    pgStyle.textContent = '';
    const L = layoutBlocks(0);
    const n = Math.max(1, Math.floor((L.maxBottom - 1) / g.H) + 1);
    printStyle.textContent = L.rules.length ? `@media print{${L.rules.join('')}}` : '';
    doc.style.height = (n * g.H) + 'px';
    root.classList.add('pm');
    if (window.eqRenderPrintDeco) window.eqRenderPrintDeco(n, g);
    return true;
  } catch (e) { reportError('print', e); window.restorePrint(); return false; }
};
window.restorePrint = function(){
  printStyle.textContent = '';
  root.classList.remove('pm');
  if (window.eqClearPrintDeco) window.eqClearPrintDeco();
  schedulePaginate();
};
let pgRaf = 0;
function schedulePaginate(){
  if (pgRaf) return;
  pgRaf = requestAnimationFrame(() => { pgRaf = 0; try { paginate(); } catch(e){ reportError('paginate', e); } });
}
const seenKids = new WeakSet();
const kidObserver = new ResizeObserver(() => schedulePaginate());
function observeKids(kids){ kids.forEach(k => { if (!seenKids.has(k)){ seenKids.add(k); kidObserver.observe(k); } }); }

function buildSheets(g){
  const key = pageSize + ':' + pageCount;
  if (key === sheetKey) return;
  sheetKey = key;
  sheetBg.innerHTML = ''; sheetUi.innerHTML = '';
  for (let i = 0; i < pageCount; i++){
    const s = document.createElement('div');
    s.className = 'sheet';
    s.style.cssText = `top:${i * g.S}px;width:${g.W}px;height:${g.H}px`;
    sheetBg.appendChild(s);
    const t = document.createElement('div');
    t.className = 'sheet-tools no-focus-steal';
    t.dataset.page = String(i + 1);
    t.style.top = (i * g.S + 10) + 'px';
    t.innerHTML = `<span class="pg-num">Page ${i + 1}</span>` +
      `<button class="pt-btn" data-act="clipboard" title="Copy page ${i + 1} as image" aria-label="Copy page ${i + 1} as image">${icon('copy', 14)}</button>` +
      `<button class="pt-btn" data-act="save" title="Save page ${i + 1} as PNG" aria-label="Save page ${i + 1} as PNG">${icon('save', 14)}</button>` +
      `<button class="pt-btn danger" data-act="delete" title="Delete page ${i + 1}" aria-label="Delete page ${i + 1}">${icon('trash', 14)}</button>`;
    sheetUi.appendChild(t);
  }
}
on(sheetUi, 'click', e => {
  const b = e.target.closest('.pt-btn');
  if (!b) return;
  const n = parseInt(b.closest('.sheet-tools').dataset.page, 10);
  if (b.dataset.act === 'delete') deletePage(n); else takeScreenshot(b.dataset.act, n);
});
/* Delete every block on page n (Ctrl+Z brings it back) */
function deletePage(n){
  if (layout !== 'print') return;
  paginate();
  const victims = [...doc.children].filter((k, i) => kidPage[i] === n - 1);
  if (!victims.length) return showToast(`Page ${n} is already empty`, 'warn');
  clearTimeout(hTimer); pushHistory();
  victims.forEach(k => k.remove());
  if (!doc.children.length) doc.innerHTML = '<p><br></p>';
  afterChange(true); pushHistory();
  showToast(`Page ${n} deleted. Press Ctrl+Z to undo`, 'warn');
}
function updatePageIndicator(){
  const el = $('#pageInd');
  if (layout !== 'print'){ el.innerHTML = ''; return; }
  const g = geo(), s = docSize / 18;
  const y = (workspace.scrollTop + workspace.clientHeight / 2 - sizer.offsetTop) / s;
  const cur = Math.max(1, Math.min(pageCount, Math.floor(y / g.S) + 1));
  curPage = cur;
  el.innerHTML = `Page <b>${cur}</b> of <b>${pageCount}</b>`;
  $('#pgPrev').disabled = cur <= 1;
  $('#pgNext').disabled = cur >= pageCount;
}
function goToPage(n){
  const g = geo(), s = docSize / 18;
  n = Math.max(1, Math.min(pageCount, n));
  workspace.scrollTo({ top: Math.max(0, sizer.offsetTop + (n - 1) * g.S * s - 16), behavior:'smooth' });
}
on($('#pgPrev'), 'click', () => goToPage(curPage - 1));
on($('#pgNext'), 'click', () => goToPage(curPage + 1));
let scrollRaf = 0;
on(workspace, 'scroll', () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; updatePageIndicator(); });
});
function syncLayoutUi(){
  $$('[data-layout-set]').forEach(b => b.classList.toggle('active', b.dataset.layoutSet === layout));
  $$('[data-size-set]').forEach(b => b.classList.toggle('active', b.dataset.sizeSet === pageSize));
}
function setLayout(l){
  layout = (l === 'web') ? 'web' : 'print';
  store.set('layoutMode', layout);
  root.dataset.layout = layout;
  syncLayoutUi(); closeAllDropdowns(); applyZoom(); schedulePaginate();
}
function setPageSize(sz){
  pageSize = (sz === 'Letter') ? 'Letter' : 'A4';
  store.set('pageSize', pageSize);
  sheetKey = '';
  syncLayoutUi(); schedulePaginate();
}
$$('[data-layout-set]').forEach(b => on(b, 'click', () => setLayout(b.dataset.layoutSet)));
$$('[data-size-set]').forEach(b => on(b, 'click', () => setPageSize(b.dataset.sizeSet)));
window.getPageSize = () => pageSize;

/* ===================== 18. Drawer ===================== */
const drawer = $('#drawer'), backdrop = $('#drawerBackdrop');
function openDrawer(){ closeAllDropdowns(); refreshInfo(); drawer.classList.add('open'); backdrop.classList.add('open'); }
function closeDrawer(){ drawer.classList.remove('open'); backdrop.classList.remove('open'); }
on($('#menuBtn'), 'click', e => { e.stopPropagation(); drawer.classList.contains('open') ? closeDrawer() : openDrawer(); });
on($('#drawerClose'), 'click', closeDrawer);
on(backdrop, 'click', closeDrawer);
const DRAWER_ACTIONS = {
  new:     () => clearDoc(),
  png:     () => takeScreenshot('save'),
  pdf:     () => requestExport('pdf'),
  print:   () => requestExport('print'),
  folder:  () => { window.pyCaptureRequest = 'folder'; },
  copyimg: () => takeScreenshot('clipboard'),
  latex:   () => copyLatex(),
  help:    () => $('#helpModal').classList.add('open')
};
$$('.d-item[data-act]').forEach(b => on(b, 'click', () => { closeDrawer(); DRAWER_ACTIONS[b.dataset.act](); }));

/* ===================== 19. Python bridge (called from main.py) ===================== */
let savedScroll = { top:0, left:0 };
window.prepareForCapture = function(){
  closeAllDropdowns(); closeDrawer(); closeLatexModal();
  savedScroll = { top: workspace.scrollTop, left: workspace.scrollLeft };
  root.classList.add('cap');
  $$('math-field', doc).forEach(m => m.classList.remove('is-focused'));
  if (document.activeElement) document.activeElement.blur();
  getSelection().removeAllRanges();
  window.scrollTo(0, 0);
};
window.restoreAfterCapture = function(){
  root.classList.remove('cap');
  workspace.scrollTop = savedScroll.top;
  workspace.scrollLeft = savedScroll.left;
};
/* Which rectangles to grab. target = page number (1-based) or null for the whole document. */
window.getCaptureInfo = function(target){
  const r = wrap.getBoundingClientRect();
  const sx = r.left, sy = r.top + window.scrollY;
  if (layout === 'print'){
    const g = geo();
    if (typeof target === 'number' && target >= 1){
      const i = Math.min(target, pageCount) - 1;
      return JSON.stringify({ segments:[{ x:sx, y:sy + i * g.S, w:g.W, h:g.H }], breaks:[] });
    }
    const kids = [...doc.children].map(c => {
      const b = c.getBoundingClientRect();
      return { t:b.top + window.scrollY - sy, b:b.bottom + window.scrollY - sy };
    });
    const segs = [];
    for (let p = 0; p < pageCount; p++){
      const cTop = p * g.S + PAGE_M, cBot = p * g.S + g.H - PAGE_M;
      let t = Infinity, b = -Infinity;
      kids.forEach(k => {
        const kt = Math.max(k.t, cTop), kb = Math.min(k.b, cBot);
        if (kb > kt){ t = Math.min(t, kt); b = Math.max(b, kb); }
      });
      if (b > t){
        const top = Math.max(p * g.S, t - 8), bottom = Math.min(p * g.S + g.H, b + 8);
        const cs = getComputedStyle(root);
        const ml = parseFloat(cs.getPropertyValue('--pg-ml')) || PAGE_M, mr = parseFloat(cs.getPropertyValue('--pg-mr')) || PAGE_M;
        segs.push({ x:sx + ml - 14, y:sy + top, w:g.W - ml - mr + 28, h:Math.ceil(bottom - top) });
      }
    }
    if (segs.length) return JSON.stringify({ segments:segs, breaks:[] });
  }
  const dr = doc.getBoundingClientRect();
  const top = dr.top + window.scrollY;
  const breaks = [...doc.children].map(c => c.getBoundingClientRect().bottom + window.scrollY - top);
  return JSON.stringify({ segments:[{ x:dr.left, y:top, w:dr.width, h:Math.ceil(dr.height) }], breaks });
};

/* ===================== 20. Help and shortcuts ===================== */
on($('#helpBtn'), 'click', () => $('#helpModal').classList.add('open'));
on($('#helpModal'), 'click', e => { if (e.target.id === 'helpModal') $('#helpModal').classList.remove('open'); });
on(document, 'keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.key === 'Escape'){ closeAllDropdowns(); closeDrawer(); closeLatexModal(); $('#helpModal').classList.remove('open'); return; }
  if ($('#latexModal').classList.contains('open')) return;           // typing in the LaTeX box
  if (ctrl && !e.shiftKey && k === 'e'){ e.preventDefault(); createEquation(''); return; }
  if (ctrl && e.shiftKey && k === 'c'){ e.preventDefault(); takeScreenshot(); return; }
  if (ctrl && e.shiftKey && k === 'l'){ e.preventDefault(); copyLatex(); return; }
  if (ctrl && !e.shiftKey && k === 'p'){ e.preventDefault(); requestExport('print'); return; }
  if (e.altKey && k === 'n'){ e.preventDefault(); nextStep(); return; }
  if (ctrl && e.key === 'Enter'){ e.preventDefault(); exitEquation(); return; }
  if (ctrl && (e.key === '=' || e.key === '+')){ e.preventDefault(); docSize += 2; applyZoom(); return; }
  if (ctrl && e.key === '-'){ e.preventDefault(); docSize -= 2; applyZoom(); return; }
  if (ctrl && e.key === '0'){ e.preventDefault(); docSize = 18; applyZoom(); return; }
  if (e.target && e.target.tagName === 'MATH-FIELD') return;        // an equation keeps its own undo
  if (ctrl && !e.shiftKey && k === 'z'){ e.preventDefault(); undo(); }
  else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))){ e.preventDefault(); redo(); }
});

/* Developer check: run  EQ_VALIDATE()  in devtools to list menu LaTeX that MathLive cannot parse */
window.EQ_VALIDATE = function(){
  const ML = window.MathLive;
  if (!ML || typeof ML.validateLatex !== 'function') return console.log('LATEX-CHECK: validator not available');
  const all = [];
  GROUPS.forEach(g => g.items.forEach(d => d.sections.forEach(s => s.items.forEach(i => all.push(i[0])))));
  GALLERY.forEach(s => s.items.forEach(i => all.push(i[0])));
  Object.values(SYM).flat().forEach(s => all.push(s[1]));
  const bad = [];
  all.forEach(l => { try { const e = ML.validateLatex(P(l)); if (e && e.length) bad.push(l + ' => ' + (e[0].code || 'error')); } catch(x){} });
  console.log('LATEX-CHECK: ' + (bad.length ? bad.length + ' problem(s): ' + bad.slice(0, 30).join(' | ') : 'all ' + all.length + ' menu items are valid'));
};

/* ===================== 21. Init ===================== */
try {
  applyTheme(store.get('theme') || 'light');
  setRibbonCollapsed(store.get('ribbonCollapsed') === '1');
  root.dataset.layout = layout;
  syncLayoutUi();
  applyZoom();
  loadSavedDocument();
  updateStats(); updateFormatState();
  schedulePaginate();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedulePaginate);
  on(window, 'load', schedulePaginate);
  setTimeout(() => { pushHistory(); schedulePaginate(); }, 500);
  console.log('Equation Studio ready (v' + APP_VERSION + ')');
} catch(err){ reportError('init', err); }