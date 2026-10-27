/* 📁 FILE: assets/thesis2.js
   Numbered equations, theorem blocks, footnotes (Notes list), abbreviations + symbols lists, front matter,
   section breaks, page setup, BibTeX parser. Uses helpers from home.js / tables.js / app.js. */
'use strict';
(function () {
  const esc = eqEsc, el = eqEl, B = window.eqBlocks;
  const uid = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4);
  const txt = n => (n.textContent || '').replace(/\u200B/g, '').replace(/\u00A0/g, ' ').trim();
  const readJson = (k, d) => { try { const v = JSON.parse(store.get(k) || 'null'); return Array.isArray(d) ? (Array.isArray(v) ? v : d) : (v && typeof v === 'object' && !Array.isArray(v) ? v : d); } catch (e) { return d; } };
  window.eqHooks = window.eqHooks || [];

  /* ---------- icons for the new buttons ---------- */
  const IX = {
    nav: '<path d="M4 6h16M4 12h10M4 18h6"/><path d="M17 15l3 3-3 3"/>', dash: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    check: '<path d="M5 12l4 4 10-10"/>', focus: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    setup: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h8M8 17h8M7 3v4M17 3v4"/>', front: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h6"/>',
    saveproj: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>', openproj: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z"/><path d="M3 10h18l-2 9H5z"/>',
    numeq: '<path d="M3 12h11"/><path d="M17 7c-1.5 2-1.5 8 0 10M21 7c1.5 2 1.5 8 0 10"/>', theorem: '<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h4"/>',
    footnote: '<path d="M4 7h12M4 12h12M4 17h7"/><path d="M19 4v6M17.5 5.5L19 4"/>', abbr: '<path d="M4 18l4-12 4 12M5.5 14h5"/><path d="M15 6h5M15 12h5M15 18h5"/>',
    symbol: '<path d="M6 7h12l-6 5 6 5H6"/>', section: '<path d="M4 4h16v6H4zM4 14h16v6H4z"/><path d="M2 12h3M19 12h3"/>'
  };
  window.eqIcx = (n, s) => '<svg viewBox="0 0 24 24" width="' + (s || 16) + '" height="' + (s || 16) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IX[n] || '') + '</svg>';
  $$('[data-x]').forEach(e => { e.innerHTML = eqIcx(e.dataset.x, +e.dataset.s || 16); });
  const refresh = () => { if (window.eqUpdateAll) window.eqUpdateAll(true); };

  /* ---------- numbered equations ---------- */
  function insertNumberedEq() {
    const d = el('div', 'eq-eqn'); d.setAttribute('data-id', uid());
    const mf = document.createElement('math-field'); setupMathField(mf); d.appendChild(mf);
    B.insertBlock(d); afterChange(true);
    setTimeout(() => { try { mf.focus(); } catch (e) { /* ignore */ } }, 60);
  }
  function numberCurrent() {
    const ae = document.activeElement;
    if (!ae || ae.tagName !== 'MATH-FIELD' || !doc.contains(ae)) return showToast('Click inside an equation first', 'warn');
    if (ae.closest('.eq-eqn')) return showToast('This equation is already numbered', 'warn');
    const p = ae.parentElement;
    const alone = p && p.parentNode === doc && p.tagName === 'P' && [...p.childNodes].every(n => n === ae || (n.nodeType === 3 && !n.nodeValue.replace(/[\u200B\u00A0\s]/g, '')));
    if (!alone) return showToast('Put the equation on its own line first, then number it', 'warn');
    const d = el('div', 'eq-eqn'); d.setAttribute('data-id', uid());
    p.replaceWith(d); d.appendChild(ae); afterChange(true);
    setTimeout(() => { try { ae.focus(); } catch (e) { /* ignore */ } }, 30);
  }
  bindPanel($('#btnNumEq'), simpleMenu([['Numbered equation (new)', '', insertNumberedEq], ['Number the equation I am in', '', numberCurrent]]));
  document.addEventListener('keydown', e => {                          // Ctrl+Enter leaves a numbered equation
    if (!(e.ctrlKey && e.key === 'Enter')) return;
    const ae = document.activeElement, d = ae && ae.tagName === 'MATH-FIELD' && ae.closest('.eq-eqn');
    if (!d) return;
    e.preventDefault(); e.stopImmediatePropagation();
    let nx = d.nextElementSibling;
    if (!nx || nx.tagName !== 'P') { nx = el('p', '', '<br>'); d.after(nx); afterChange(true); }
    B.setCaret(nx, false);
  }, true);
  eqHooks.push(() => { let ch = false; $$('.eq-eqn', doc).forEach(d => { if (!d.querySelector('math-field')) { d.remove(); ch = true; } }); return ch; });

  /* ---------- theorem-style blocks ---------- */
  function insertTheorem(type) {
    const p = el('p', 'eq-th', '<br>'); p.setAttribute('data-th', type); p.setAttribute('data-id', uid());
    B.insertBlock(p); afterChange(true); B.setCaret(p, false);
  }
  bindPanel($('#btnTheo'), simpleMenu(Object.entries(eqTheoNames).map(([k, v]) => [v, '', () => insertTheorem(k)])));
  const plainTh = b => { b.className = ''; ['data-th', 'data-num', 'data-label', 'data-id'].forEach(a => b.removeAttribute(a)); b.removeAttribute('class'); };
  on(doc, 'input', e => {                                              // Enter inside a theorem makes a continuation paragraph
    if (e.inputType !== 'insertParagraph') return;
    const b = B.blockAtCaret(), prev = b && b.previousElementSibling;
    if (b && prev && b.matches('p.eq-th') && prev.matches('p.eq-th')) {
      b.classList.add('eq-th-c'); ['data-num', 'data-label', 'data-id'].forEach(a => b.removeAttribute(a));
    }
  });
  on(doc, 'keydown', e => {                                            // Enter on an empty theorem line leaves the theorem
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || (e.target && e.target.tagName === 'MATH-FIELD')) return;
    const b = B.blockAtCaret();
    if (b && b.matches('p.eq-th') && !txt(b) && !b.querySelector('math-field')) { e.preventDefault(); plainTh(b); afterChange(true); }
  });

  /* ---------- footnotes (listed under "Notes") ---------- */
  const markers = () => $$('span.eq-fnref', doc);
  function insertFootnote() {
    eqUI.form('Insert Footnote', [{ id: 'text', label: 'Footnote text', type: 'textarea', rows: 4, value: '', hint: 'Footnotes are numbered automatically. Insert the Notes list (References tab) where the notes should appear.' }], v => {
      const t = v.text.trim().slice(0, 1000);
      if (!t) { showToast('Type the footnote text', 'warn'); return false; }
      eqRestoreSel();
      document.execCommand('insertHTML', false, '<span class="eq-fnref" contenteditable="false" data-note="' + esc(t) + '">0</span>');
      afterChange(true);
    }, { okText: 'Insert', width: '440px' });
  }
  on($('#btnFootnote'), 'click', insertFootnote);
  doc.addEventListener('click', e => {
    const m = e.target.closest && e.target.closest('.eq-fnref');
    if (!m) return;
    eqUI.form('Edit footnote', [
      { id: 'text', label: 'Footnote text', type: 'textarea', rows: 4, value: m.getAttribute('data-note') || '' },
      { id: 'del', label: 'Delete this footnote', type: 'checkbox', value: false }
    ], v => { if (v.del) m.remove(); else m.setAttribute('data-note', v.text.trim().slice(0, 1000)); afterChange(true); }, { okText: 'Save', width: '440px' });
  });
  function insertBlockDiv(cls) {
    const d = el('div', cls); d.setAttribute('contenteditable', 'false');
    const tail = B.insertBlock(d); afterChange(true); B.setCaret(tail, false); refresh();
  }
  on($('#btnNotesList'), 'click', () => insertBlockDiv('eq-notes'));
  eqHooks.push(() => {
    let ch = false;
    markers().forEach((m, i) => {
      const t = String(i + 1), note = m.getAttribute('data-note') || '';
      if (m.textContent !== t) { m.textContent = t; ch = true; }
      if (m.title !== note) m.title = note;
    });
    $$('.eq-notes', doc).forEach(d => {
      const list = markers();
      const html = '<div class="eq-toc-title">Notes</div>' + (list.length
        ? list.map((m, i) => '<div class="eq-note-row"><b>' + (i + 1) + '.</b> ' + esc(m.getAttribute('data-note') || '') + '</div>').join('')
        : '<div class="eq-toc-empty">No footnotes yet. Use References → Insert Footnote.</div>');
      if (d._html !== html) { d.innerHTML = html; d._html = html; ch = true; }
    });
    return ch;
  });

  /* ---------- abbreviations and symbols ---------- */
  const getAbbr = () => readJson('eqAbbr', []), putAbbr = a => store.set('eqAbbr', JSON.stringify(a));
  const getSym = () => readJson('eqSym', []), putSym = a => store.set('eqSym', JSON.stringify(a));
  function findAbbrCandidates(existing) {
    const counts = {};
    const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement && n.parentElement.closest('math-field,.eq-toc,.eq-bib,.eq-abbr,.eq-symlist,.eq-notes,h1,h2,h3')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    while (w.nextNode()) (w.currentNode.nodeValue.match(/\b[A-Z][A-Z0-9]{1,7}\b/g) || []).forEach(a => { counts[a] = (counts[a] || 0) + 1; });
    const stop = new Set(['II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'OK', 'PM', 'AM']);
    return Object.keys(counts).filter(a => counts[a] >= 2 && !stop.has(a) && !existing.includes(a)).sort();
  }
  function listEditor(title, cols, get, put, extra) {
    const rows = get().map(r => Object.assign({}, r));
    const ov = el('div', 'eqmodal open'), card = el('div', 'eqmodal-card'); card.style.width = '640px';
    card.innerHTML = '<h3>' + esc(title) + '</h3>';
    const tools = el('div', 'le-tools'), box = el('div', 'le-rows');
    card.appendChild(tools); card.appendChild(box);
    const draw = () => {
      box.innerHTML = '';
      rows.forEach((r, i) => {
        const line = el('div', 'le-row');
        cols.forEach(c => { const inp = el('input'); inp.type = 'text'; inp.placeholder = c.ph; inp.value = r[c.k] || ''; inp.style.flex = c.flex || '1'; inp.addEventListener('input', () => { r[c.k] = inp.value; }); line.appendChild(inp); });
        const x = el('button', 'btn', '✕'); x.type = 'button'; x.title = 'Remove'; x.addEventListener('click', () => { rows.splice(i, 1); draw(); });
        line.appendChild(x); box.appendChild(line);
      });
      if (!rows.length) box.appendChild(el('div', 'fld-hint', 'Nothing yet. Press + Add.'));
    };
    const add = el('button', 'btn', '+ Add'); add.type = 'button';
    add.addEventListener('click', () => { rows.push({}); draw(); const l = box.querySelector('.le-row:last-child input'); if (l) l.focus(); });
    tools.appendChild(add);
    if (extra) { const b = el('button', 'btn', esc(extra.label)); b.type = 'button'; b.addEventListener('click', () => { extra.run(rows); draw(); }); tools.appendChild(b); }
    const actions = el('div', 'eqmodal-actions'), done = el('button', 'btn btn-primary', 'Done'); done.type = 'button';
    const finish = () => { put(rows.filter(r => cols.some(c => (r[c.k] || '').trim()))); ov.remove(); refresh(); };
    done.addEventListener('click', finish); actions.appendChild(done); card.appendChild(actions); ov.appendChild(card);
    ov.addEventListener('mousedown', e => { if (e.target === ov) finish(); });
    ov.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') finish(); });
    document.body.appendChild(ov); draw();
  }
  on($('#btnAbbrEdit'), 'click', () => listEditor('Abbreviations', [{ k: 's', ph: 'Abbreviation (e.g. CNN)', flex: '0 0 170px' }, { k: 'l', ph: 'Meaning (e.g. Convolutional Neural Network)' }], getAbbr, putAbbr, {
    label: 'Find in document',
    run: rows => { const found = findAbbrCandidates(rows.map(r => (r.s || '').trim())); found.forEach(a => rows.push({ s: a, l: '' })); showToast(found.length ? found.length + ' possible abbreviations added: fill in their meaning' : 'No new abbreviations found', found.length ? 'success' : 'warn'); }
  }));
  on($('#btnSymEdit'), 'click', () => listEditor('Symbols', [{ k: 's', ph: 'LaTeX (e.g. \\sigma)', flex: '0 0 170px' }, { k: 'm', ph: 'Meaning' }, { k: 'u', ph: 'Unit', flex: '0 0 90px' }], getSym, putSym));
  on($('#btnAbbrList'), 'click', () => insertBlockDiv('eq-abbr'));
  on($('#btnSymList'), 'click', () => insertBlockDiv('eq-symlist'));
  eqHooks.push(() => {
    let ch = false;
    const ab = getAbbr().filter(r => (r.s || '').trim()).sort((a, b) => a.s.localeCompare(b.s));
    $$('.eq-abbr', doc).forEach(d => {
      const html = '<div class="eq-toc-title">List of Abbreviations</div>' + (ab.length
        ? ab.map(r => '<div class="eq-ab-row"><b>' + esc(r.s) + '</b><span>' + esc(r.l || '') + '</span></div>').join('')
        : '<div class="eq-toc-empty">No abbreviations yet. Use References → Abbreviations.</div>');
      if (d._html !== html) { d.innerHTML = html; d._html = html; ch = true; }
    });
    const sy = getSym().filter(r => (r.s || '').trim()), sig = JSON.stringify(sy);
    $$('.eq-symlist', doc).forEach(d => {
      if (d._sig === sig) return;
      d.innerHTML = '<div class="eq-toc-title">List of Symbols</div>';
      if (!sy.length) d.appendChild(el('div', 'eq-toc-empty', 'No symbols yet. Use References → Symbols.'));
      sy.forEach(r => {
        const row = el('div', 'eq-sym-row'), mf = document.createElement('math-field');
        mf.setAttribute('read-only', 'true'); mf.setAttribute('math-virtual-keyboard-policy', 'manual'); mf.className = 'eq-sym-m';
        try { mf.value = r.s; } catch (e) { /* shown empty */ }
        row.appendChild(mf); row.appendChild(el('span', 'eq-sym-t', esc(r.m || '') + (r.u ? ' <i>[' + esc(r.u) + ']</i>' : '')));
        d.appendChild(row);
      });
      d._sig = sig; ch = true;
    });
    return ch;
  });

  /* ---------- front matter and section breaks ---------- */
  const mkBreak = () => { const d = el('div', 'eq-pagebreak'); d.setAttribute('contenteditable', 'false'); d.setAttribute('data-pb', '1'); return d; };
  const H = t => el('h1', 'eq-unnum', esc(t));
  const P = (h, st) => { const p = el('p', '', h); if (st) p.setAttribute('style', st); return p; };
  const TODAY = () => new Date().toLocaleDateString('en-GB');
  const FRONT = [
    ['Declaration', () => [H('Declaration'), P('I hereby declare that this thesis is my own original work and has not been submitted, in whole or in part, for any other degree. All sources of information have been duly acknowledged.'), P('Signature: ______________________', 'margin-top:48px'), P('Name: Author Name'), P('Date: ' + TODAY())]],
    ['Certificate / Approval', () => [H('Certificate'), P('This is to certify that the thesis entitled “Thesis Title” submitted by Author Name is a record of original work carried out under my supervision and is approved for submission.'), P('Supervisor: ______________________', 'margin-top:48px'), P('Dr. Supervisor Name'), P('Head of Department: ______________________', 'margin-top:36px')]],
    ['Acknowledgements', () => [H('Acknowledgements'), P('I would like to thank my supervisor, Dr. Supervisor Name, for guidance and encouragement throughout this work. I am also grateful to my family and friends for their constant support.')]],
    ['Abstract', () => [H('Abstract'), P('Write a short summary of the problem, the method, the main results and the conclusion (about 150 to 300 words).'), P('<b>Keywords:</b> keyword one, keyword two, keyword three', 'margin-top:12px')]],
    ['Dedication', () => [P('<i>To my parents</i>', 'text-align:center;margin-top:200px;font-size:1.2em')]]
  ];
  function insertNodes(nodes) {
    B.insertBlock(nodes[0]);
    let ref = nodes[0]; nodes.slice(1).forEach(n => { ref.after(n); ref = n; });
    afterChange(true); B.setCaret(nodes[0], true);
  }
  bindPanel($('#btnFront'), simpleMenu(FRONT.map(([name, build]) => [name, '', () => insertNodes(build().concat([mkBreak()]))])));
  function insertSection(fmt) {
    const b = mkBreak(); b.setAttribute('data-sec', fmt); b.setAttribute('data-start', '1');
    const tail = B.insertBlock(b); afterChange(true); B.setCaret(tail, false);
    showToast(fmt === 'none' ? 'Pages after this break have no page number' : 'Page numbers restart here (' + (fmt === 'arabic' ? '1, 2, 3' : 'i, ii, iii') + ')');
  }
  bindPanel($('#btnSection'), simpleMenu([['Front matter (i, ii, iii)', '', () => insertSection('lroman')], ['Main body (1, 2, 3)', '', () => insertSection('arabic')], ['No page numbers (cover)', '', () => insertSection('none')]]));

  /* ---------- page setup ---------- */
  const PRESET = { normal: [1, 1], thesis: [1.5, 1], narrow: [0.5, 0.5], wide: [1.25, 1.25] };
  function applyMargins() {
    const m = readJson('eqMargins', {});
    root.style.setProperty('--pg-ml', (Math.max(24, Math.min(240, +m.l || 72))) + 'px');
    root.style.setProperty('--pg-mr', (Math.max(24, Math.min(240, +m.r || 72))) + 'px');
    root.style.setProperty('--doc-lh', ['1', '1.15', '1.5', '2'].includes(String(m.lh)) ? String(m.lh) : '1.5');
    schedulePaginate();
  }
  function openPageSetup() {
    const m = readJson('eqMargins', {}), inch = px => String(Math.round((px / 96) * 100) / 100);
    eqUI.form('Page Setup', [
      { id: 'preset', label: 'Preset', type: 'select', value: 'custom', options: [['custom', 'Custom (the values below)'], ['normal', 'Normal: 1" left and right'], ['thesis', 'Thesis: 1.5" left (binding), 1" right'], ['narrow', 'Narrow: 0.5"'], ['wide', 'Wide: 1.25"']] },
      { id: 'l', label: 'Left margin (inches)', type: 'number', value: inch(+m.l || 72), min: 0.3 },
      { id: 'r', label: 'Right margin (inches)', type: 'number', value: inch(+m.r || 72), min: 0.3 },
      { id: 'lh', label: 'Line spacing', type: 'select', value: String(m.lh || '1.5'), options: [['1', 'Single (1.0)'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', 'Double (2.0)']], hint: 'Top and bottom margins are 1 inch.' }
    ], v => {
      let l = parseFloat(v.l), r = parseFloat(v.r);
      if (PRESET[v.preset]) { l = PRESET[v.preset][0]; r = PRESET[v.preset][1]; }
      if (!(l >= 0.3 && r >= 0.3 && l <= 2.5 && r <= 2.5)) { showToast('Margins must be between 0.3 and 2.5 inches', 'warn'); return false; }
      store.set('eqMargins', JSON.stringify({ l: Math.round(l * 96), r: Math.round(r * 96), lh: v.lh }));
      applyMargins(); showToast('Page setup applied');
    }, { okText: 'Apply' });
  }
  on($('#btnPageSetup'), 'click', openPageSetup);
  applyMargins();

  /* ---------- BibTeX import (used by Manage Sources) ---------- */
  const BT = { article: 'article', book: 'book', inbook: 'book', incollection: 'book', inproceedings: 'conf', conference: 'conf', proceedings: 'conf', phdthesis: 'thesis', mastersthesis: 'thesis', thesis: 'thesis', misc: 'web', online: 'web', electronic: 'web', techreport: 'report', report: 'report' };
  const bibClean = s => String(s || '').replace(/\\&/g, '&').replace(/\\%/g, '%').replace(/\\_/g, '_').replace(/\\['`^"~=.]\{?(\w)\}?/g, '$1').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  function bibToSource(type, f) {
    const doi = f.doi ? 'https://doi.org/' + f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : '';
    return {
      id: uid(), type: BT[type] || 'article',
      authors: (f.author || f.editor || '').split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean).join('\n'),
      year: f.year || (f.date || '').slice(0, 4) || '', title: f.title || '',
      container: f.journal || f.journaltitle || f.booktitle || f.school || f.institution || f.howpublished || '',
      publisher: f.publisher || '', volume: f.volume || '', issue: f.number || f.issue || '',
      pages: (f.pages || '').replace(/--+/g, '-'), url: f.url || doi
    };
  }
  window.eqParseBib = function (src) {
    const out = [], re = /@(\w+)\s*[{(]\s*([^,\s]*)\s*,/g;
    let m;
    while ((m = re.exec(src))) {
      const type = m[1].toLowerCase();
      if (['comment', 'string', 'preamble'].includes(type)) continue;
      let i = re.lastIndex, depth = 1;
      const fields = {};
      while (i < src.length && depth > 0) {
        const fm = /\s*([A-Za-z_-]+)\s*=\s*/y;
        fm.lastIndex = i;
        const mm = fm.exec(src);
        if (!mm) { if (src[i] === '}') depth--; i++; continue; }
        i = fm.lastIndex;
        let val = '';
        if (src[i] === '{') { let d = 0, j = i; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } } val = src.slice(i + 1, j); i = j + 1; }
        else if (src[i] === '"') { let j = i + 1; while (j < src.length && (src[j] !== '"' || src[j - 1] === '\\')) j++; val = src.slice(i + 1, j); i = j + 1; }
        else { const vm = /[^,}\s]+/y; vm.lastIndex = i; const v2 = vm.exec(src); if (v2) { val = v2[0]; i += v2[0].length; } else i++; }
        fields[mm[1].toLowerCase()] = bibClean(val);
        while (i < src.length && /[\s,]/.test(src[i])) i++;
        if (src[i] === '}') { depth--; i++; }
      }
      re.lastIndex = i;
      if (fields.title) out.push(bibToSource(type, fields));
      if (out.length >= 500) break;
    }
    return out;
  };
})();
