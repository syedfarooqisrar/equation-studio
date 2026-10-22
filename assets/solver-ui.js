/* 📁 FILE: assets/solver-ui.js
   Solve button (💡), right-side solution panel, and "Add to document".
   Uses globals from app.js: doc, workspace, root, activeField, savedRange, ZW, $, $$, on, icon, showToast,
   setupMathField, afterChange, reportError. */
'use strict';
(function () {
  const fab = $('#solveFab'), panel = $('#solvePanel'), body = $('#solBody'), foot = $('#solFoot'), shell = $('#wsShell');
  let seq = 0, result = null, lastLatex = '', waitTimer = 0, fabDebounce = 0;
  const SOLVABLE = /\\int|\\lim|\\sum|\\prod|\\frac|\\sqrt|\\sin|\\cos|\\tan|\\ln|\\log|\\exp|\^|=|<|>|\\le|\\ge|\+|-|\\cdot|\\times|\\div|\//;

  fab.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>';
  $('.sol-head-title').insertAdjacentHTML('afterbegin', '<span style="color:var(--accent);display:grid">' + fab.innerHTML + '</span>');

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  function mathEl(latex, cls) {
    const m = document.createElement('math-field');
    m.setAttribute('read-only', 'true');
    m.setAttribute('math-virtual-keyboard-policy', 'manual');
    m.className = 'sol-math' + (cls ? ' ' + cls : '');
    try { m.value = latex; } catch (e) { /* shown empty */ }
    return m;
  }

  /* ---------- the button ---------- */
  function looksSolvable(latex) { return !!latex && !/\\placeholder/.test(latex) && SOLVABLE.test(latex); }

  function hideFab() { fab.classList.remove('show'); }
  function updateFab() {
    try {
      const mf = activeField;
      if (!mf || !doc.contains(mf) || root.classList.contains('cap') || document.activeElement !== mf) return hideFab();
      let latex = '';
      try { latex = mf.getValue('latex'); } catch (e) { return hideFab(); }
      if (!looksSolvable(latex)) return hideFab();
      const r = mf.getBoundingClientRect(), w = workspace.getBoundingClientRect();
      if (r.bottom < w.top + 10 || r.top > w.bottom - 10) return hideFab();
      fab.style.left = Math.min(r.right + 6, w.right - 34) + 'px';
      fab.style.top = Math.max(w.top + 4, r.top - 12) + 'px';
      fab.classList.add('show');
    } catch (e) { hideFab(); }
  }
  const scheduleFab = () => { clearTimeout(fabDebounce); fabDebounce = setTimeout(updateFab, 40); };
  document.addEventListener('focusin', scheduleFab, true);
  document.addEventListener('focusout', () => setTimeout(updateFab, 250), true);
  on(doc, 'input', scheduleFab);
  on(workspace, 'scroll', updateFab);
  on(window, 'resize', updateFab);
  setInterval(updateFab, 600);                       // safety net: zoom, pagination, layout changes

  /* ---------- panel states ---------- */
  function problemCard(latex) {
    const c = el('div', 'sol-problem', '<div class="sol-label">Problem</div>');
    c.appendChild(mathEl(latex));
    return c;
  }
  function openPanel() { shell.classList.add('solve-open'); }
  function closePanel() {
    shell.classList.remove('solve-open');
    seq++; result = null; clearTimeout(waitTimer);
    setTimeout(updateFab, 50);
  }

  function showLoading(latex) {
    foot.hidden = true;
    body.innerHTML = '';
    body.appendChild(problemCard(latex));
    body.appendChild(el('div', 'sol-loading',
      '<div class="sol-spin"></div><div>Solving step by step…</div><div class="sol-skel"></div><div class="sol-skel short"></div>'));
  }
  function showError(res) {
    foot.hidden = true;
    body.innerHTML = '';
    body.appendChild(problemCard(lastLatex));
    body.appendChild(el('div', 'sol-error', '<b>' + esc(res.error || 'Could not solve this one.') + '</b><span>' + esc(res.hint || '') + '</span>'));
  }
  function showResult(res) {
    result = res;
    body.innerHTML = '';
    body.appendChild(problemCard(lastLatex));

    const meta = el('div', 'sol-meta', '<span class="sol-badge">' + esc(res.title || res.kind) + '</span>');
    if (res.vars && res.vars.length > 1 && /equation|inequality/.test(res.kind)) {
      const wrapSel = el('label', '', 'Solve for&nbsp;');
      const sel = el('select', 'sol-select');
      res.vars.forEach(v => { const o = el('option', '', esc(v)); o.value = v; if (v === res.variable) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', () => requestSolve(lastLatex, sel.value));
      wrapSel.appendChild(sel); meta.appendChild(wrapSel);
    }
    body.appendChild(meta);

    const ol = el('ol', 'sol-steps');
    (res.steps || []).forEach((s, i) => {
      const li = el('li', 'sol-step', '<span class="sol-num">' + (i + 1) + '</span>');
      const main = el('div', 'sol-main', '<div class="sol-st">' + esc(s.title) + '</div>');
      if (s.latex) main.appendChild(mathEl(s.latex));
      if (s.note) main.appendChild(el('div', 'sol-note', esc(s.note)));
      li.appendChild(main); ol.appendChild(li);
    });
    body.appendChild(ol);

    const ans = el('div', 'sol-answer', '<div class="sol-label">Answer</div>');
    ans.appendChild(mathEl(res.answer || '', 'sol-ans'));
    if (res.decimal) ans.appendChild(el('div', 'sol-dec', '≈ ' + esc(res.decimal)));
    body.appendChild(ans);

    if (res.notes && res.notes.length) body.appendChild(el('ul', 'sol-notes', res.notes.map(n => '<li>' + esc(n) + '</li>').join('')));
    foot.hidden = false;
    body.scrollTop = 0;
  }

  /* ---------- talking to Python ---------- */
  function requestSolve(latex, variable) {
    lastLatex = latex;
    const id = ++seq;
    openPanel(); showLoading(latex);
    window.pySolveRequest = JSON.stringify({ id: id, latex: latex, var: variable || null });
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => {
      if (id === seq) showError({ error: 'This is taking too long.', hint: 'Try a simpler problem, then press the 💡 button again.' });
    }, 50000);
  }
  window.onSolveResult = function (res) {
    try {
      if (!res || res.id !== seq) return;               // an older request: ignore
      clearTimeout(waitTimer);
      if (res.ok) showResult(res); else showError(res);
    } catch (e) { reportError('solve-result', e); }
  };

  function solveActive() {
    const mf = activeField;
    if (!mf || !doc.contains(mf)) return showToast('Click an equation first', 'warn');
    let latex = '';
    try { latex = mf.getValue('latex'); } catch (e) { /* empty */ }
    if (!latex.trim()) return showToast('The equation is empty', 'warn');
    requestSolve(latex);
  }

  /* ---------- "Add to document" ---------- */
  function currentBlock() {
    const sel = getSelection();
    let n = (sel.rangeCount && doc.contains(sel.anchorNode)) ? sel.anchorNode : null;
    if (!n && activeField && doc.contains(activeField)) n = activeField;
    if (!n && savedRange && doc.contains(savedRange.startContainer)) n = savedRange.startContainer;
    while (n && n.parentNode !== doc) n = n.parentNode;
    return n || null;
  }
  const isEmptyBlock = b => b && !b.querySelector('math-field') && !(b.textContent || '').replace(/\u200B/g, '').trim();

  function addToDocument(answerOnly) {
    if (!result) return;
    const items = [];                                    // { node, latex? }
    const para = html => { const p = document.createElement('p'); p.innerHTML = html; return p; };
    const eqPara = (latex, label) => {
      const p = document.createElement('p');
      if (label) p.insertAdjacentHTML('beforeend', label);
      const mf = document.createElement('math-field');
      mf.setAttribute('value', latex);
      p.appendChild(mf); p.appendChild(document.createTextNode(ZW));
      return { node: p, latex: latex };
    };
    if (!answerOnly) {
      (result.steps || []).forEach((s, i) => {
        items.push({ node: para('<b>Step ' + (i + 1) + ':</b> ' + esc(s.title)) });
        if (s.latex) items.push(eqPara(s.latex));
      });
    }
    items.push(eqPara(result.answer || '', '<b>Answer:</b>&nbsp;'));

    const block = currentBlock() || doc.lastElementChild;
    let tail;
    if (block && isEmptyBlock(block)) {                  // use the empty line the cursor is on
      items.forEach(it => doc.insertBefore(it.node, block));
      tail = block;
    } else {
      let ref = block;
      items.forEach(it => { if (ref) ref.after(it.node); else doc.appendChild(it.node); ref = it.node; });
      tail = para('<br>'); ref.after(tail);
    }
    items.forEach(it => {
      if (!it.latex) return;
      const mf = it.node.querySelector('math-field');
      setupMathField(mf);
      try { mf.value = it.latex; } catch (e) { /* shown empty */ }
    });
    afterChange(true);
    try {                                                // cursor on the empty line after the solution
      doc.focus();
      const r = document.createRange(); r.selectNodeContents(tail); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      tail.scrollIntoView({ block: 'nearest' });
    } catch (e) { /* the text is in the document anyway */ }
    showToast(answerOnly ? 'Answer added to the document' : 'Steps added to the document');
  }

  /* ---------- wiring ---------- */
  on(fab, 'click', solveActive);
  on($('#solClose'), 'click', closePanel);
  on($('#solAdd'), 'click', () => addToDocument(false));
  on($('#solAddAnswer'), 'click', () => addToDocument(true));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && shell.classList.contains('solve-open')) closePanel();
    else if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); solveActive(); }
  });
})();