/* 📁 FILE: assets/clipboard.js
   Ctrl+C on an equation (or on a selection that contains equations) so that it pastes well into Word.
   Mode "equation": text/html with MathML (Word turns it into an editable equation); text/plain = LaTeX.
   Mode "image":    a picture of the selection (looks identical everywhere), made by the Python side.
   Uses globals from app.js: doc, $, $$, on, guard, store, showToast. */
'use strict';
(function () {
  const NS = 'http://www.w3.org/1998/Math/MathML';
  const getMode = () => (store.get('copyMode') === 'image' ? 'image' : 'equation');
  let snap = null;                                           // what an image copy is about

  function mathmlFor(mf) {
    let s = '';
    try { s = mf.getValue('math-ml') || ''; } catch (e) { s = ''; }
    s = String(s).trim();
    if (!/^<math[\s>]/.test(s)) return '';
    if (!/xmlns\s*=/.test(s)) s = s.replace(/^<math/, '<math xmlns="' + NS + '"');
    return s;
  }
  const latexOf = mf => { try { return mf.getValue('latex') || ''; } catch (e) { return ''; } };

  function htmlToText(html) {
    const t = html.replace(/<\/(p|div|li)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    const ta = document.createElement('textarea');
    ta.innerHTML = t;
    return ta.value.replace(/\u200B/g, '').replace(/\u00A0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* the caret is inside one equation */
  function fromField(mf) {
    const all = latexOf(mf);
    if (!all.trim()) return null;
    let partial = '';
    try {
      const r = mf.selection && mf.selection.ranges && mf.selection.ranges[0];
      if (r && r[0] !== r[1]) {
        const s = mf.getValue(mf.selection, 'latex');
        if (s && s !== all) partial = s;
      }
    } catch (e) { partial = ''; }
    if (partial) return { text: partial, html: '', node: mf };       // part of an equation: plain LaTeX only
    const ml = mathmlFor(mf);
    return { text: all, html: ml ? '<p>' + ml + '</p>' : '', node: mf };
  }

  /* a selection in the document text that contains at least one equation */
  function fromSelection() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    if (!doc.contains(r.commonAncestorContainer)) return null;
    const fields = $$('math-field', doc).filter(m => r.intersectsNode(m));
    if (!fields.length) return null;

    const fragH = r.cloneContents(), fragT = r.cloneContents();
    [...fragH.querySelectorAll('math-field')].forEach((c, i) => {
      const live = fields[i];
      const ml = live ? mathmlFor(live) : '';
      if (ml) {
        const holder = document.createElement('span');
        holder.innerHTML = ml;
        c.replaceWith(holder.firstElementChild || document.createTextNode(''));
      } else {
        c.replaceWith(document.createTextNode(live ? '$' + latexOf(live) + '$' : ''));
      }
    });
    [...fragT.querySelectorAll('math-field')].forEach((c, i) => {
      c.replaceWith(document.createTextNode(fields[i] ? '$' + latexOf(fields[i]) + '$' : ''));
    });
    const wH = document.createElement('div'), wT = document.createElement('div');
    wH.appendChild(fragH); wT.appendChild(fragT);
    return { text: htmlToText(wT.innerHTML), html: wH.innerHTML.replace(/\u200B/g, ''), range: r.cloneRange() };
  }

  /* ---- Ctrl+C ---- */
  document.addEventListener('copy', guard(e => {
    const ae = document.activeElement;
    const payload = (ae && ae.tagName === 'MATH-FIELD' && doc.contains(ae)) ? fromField(ae) : fromSelection();
    if (!payload || !e.clipboardData) return;                        // normal text: default copy
    e.preventDefault();
    e.stopImmediatePropagation();                                    // MathLive's own copy would overwrite ours
    if (getMode() === 'image') {
      snap = payload;
      window.pyCaptureRequest = 'selection';
      return;
    }
    e.clipboardData.setData('text/plain', payload.text);
    if (payload.html) e.clipboardData.setData('text/html', payload.html);
    showToast(payload.html ? 'Equation copied. Paste it in Word with Ctrl+V.' : 'Copied as LaTeX text.');
  }, 'copy'), true);

  /* ---- image mode: tell Python which rectangle to grab ---- */
  function selRect() {
    let r = null;
    if (snap && snap.node && document.contains(snap.node)) r = snap.node.getBoundingClientRect();
    else if (snap && snap.range) r = snap.range.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return null;
    const pad = 6;
    return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top + window.scrollY - pad), w: r.width + pad * 2, h: Math.ceil(r.height + pad * 2) };
  }
  const baseInfo = window.getCaptureInfo;
  window.getCaptureInfo = function (target) {
    if (target === 'sel') {
      const b = selRect();
      if (b) return JSON.stringify({ segments: [b], breaks: [] });
    }
    return baseInfo(typeof target === 'string' ? null : target);
  };
  const baseRestore = window.restoreAfterCapture;
  window.restoreAfterCapture = function () {
    baseRestore();
    try {
      if (snap) {
        if (snap.node && document.contains(snap.node)) snap.node.focus();
        else if (snap.range) { doc.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(snap.range); }
      }
    } catch (e) { /* the copy is already on the clipboard */ }
    snap = null;
  };

   /* a chart (or any block) copied as a picture; used by the chart's "Copy picture" button */
  window.copyNodeAsImage = function (node) { snap = { node: node }; window.pyCaptureRequest = 'selection'; };

  /* ---- setting: Copy to Word as ---- */
  function syncSeg() { $$('[data-copy-mode]').forEach(b => b.classList.toggle('active', b.dataset.copyMode === getMode())); }
  $$('[data-copy-mode]').forEach(b => on(b, 'click', () => {
    store.set('copyMode', b.dataset.copyMode);
    syncSeg();
    showToast(b.dataset.copyMode === 'image' ? 'Ctrl+C now copies a picture' : 'Ctrl+C now copies an editable equation');
  }));
  syncSeg();
})();