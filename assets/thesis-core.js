/* 📁 FILE: assets/thesis-core.js : automatic numbers (chapter-based) and section-aware page labels */
'use strict';
(function () {
  const hnumOn = () => root.classList.contains('hnum');
  const THEO = { theorem: 'Theorem', lemma: 'Lemma', proposition: 'Proposition', corollary: 'Corollary', definition: 'Definition', remark: 'Remark', example: 'Example', proof: 'Proof' };
  window.eqTheoNames = THEO;
  const setAttr = (e, k, v) => { if (e.getAttribute(k) !== v) e.setAttribute(k, v); };

  /* figures, tables, equations and theorems: numbered per chapter when "Number headings" is on, else 1, 2, 3 */
  function renumber() {
    const chap = hnumOn();
    let ch = 0, c = { fig: 0, tab: 0, eq: 0, th: 0 };
    [...doc.children].forEach(b => {
      if (b.tagName === 'H1' && !b.classList.contains('eq-unnum')) { ch++; if (chap) c = { fig: 0, tab: 0, eq: 0, th: 0 }; }
      const f = n => (chap && ch) ? ch + '.' + n : String(n);
      if (b.matches('p.eq-caption[data-cap]')) setAttr(b, 'data-num', f(++c[b.getAttribute('data-cap') === 'figure' ? 'fig' : 'tab']));
      else if (b.classList.contains('eq-eqn')) setAttr(b, 'data-num', f(++c.eq));
      else if (b.matches('p.eq-th') && !b.classList.contains('eq-th-c')) {
        const t = b.getAttribute('data-th') || 'theorem';
        if (t === 'proof') { setAttr(b, 'data-label', 'Proof.'); b.removeAttribute('data-num'); }
        else { const n = f(++c.th); setAttr(b, 'data-num', n); setAttr(b, 'data-label', (THEO[t] || 'Theorem') + ' ' + n + '.'); }
      }
    });
  }
  window.eqCore = { renumber };

  /* page numbers per section (front matter i, ii, iii; main body 1, 2, 3) */
  let cache = { k: null, n: -1, list: [] };
  function sectionStarts() {
    if (cache.k === kidPage && cache.n === doc.children.length) return cache.list;
    const out = [];
    [...doc.children].forEach((b, i) => {
      if (b.classList.contains('eq-pagebreak') && b.hasAttribute('data-sec') && Array.isArray(kidPage) && kidPage[i] != null) {
        out.push({ page: kidPage[i] + 1, fmt: b.getAttribute('data-sec'), start: parseInt(b.getAttribute('data-start'), 10) || 1 });
      }
    });
    cache = { k: kidPage, n: doc.children.length, list: out };
    return out;
  }
  window.eqSectionLabel = function (i, fmtNum, baseLabel) {
    const s = sectionStarts().filter(x => x.page <= i).pop();
    return s ? fmtNum(s.start + (i - s.page), s.fmt) : baseLabel(i);
  };
})();
