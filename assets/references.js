/* 📁 FILE: assets/references.js
   References tab: Table of Contents / List of Figures / List of Tables, captions with automatic numbers,
   cross-references, number headings, sources + citations + bibliography (APA, Harvard, IEEE).
   Everything generated here is rebuilt automatically when the document changes. */
'use strict';
(function () {
  const esc = eqEsc, el = eqEl, ico = eqIco, B = window.eqBlocks;
  const uid = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4);
  $$('#tabReferences [data-i]').forEach(e => { e.innerHTML = ico(e.dataset.i, +e.dataset.s || 16); });
  const text = n => (n.textContent || '').replace(/\u200B/g, '').replace(/\u00A0/g, ' ').trim();
  const hnumOn = () => root.classList.contains('hnum');

  /* ---------- headings and captions ---------- */
  function headingList() {
    const out = [], c = [0, 0, 0];
    $$('h1,h2,h3', doc).forEach(h => {
      const lv = +h.tagName[1];
      if (h.classList.contains('eq-unnum')) { out.push({ el: h, level: lv, num: '', text: text(h) }); return; }
      c[lv - 1]++; for (let k = lv; k < 3; k++) c[k] = 0;
      out.push({ el: h, level: lv, num: c.slice(0, lv).join('.'), text: text(h) });
    });
    return out;
  }
  const captionList = kind => $$('p.eq-caption[data-cap="' + kind + '"]', doc).map((p, i) => ({ el: p, n: p.getAttribute('data-num') || String(i + 1), kind, text: text(p) }));
  const capLabel = c => (c.kind === 'figure' ? 'Figure ' : 'Table ') + c.n;
  function pageOf(elm) {
    if (typeof layout === 'undefined' || layout !== 'print' || !Array.isArray(kidPage)) return '';
    let n = elm; while (n && n.parentNode !== doc) n = n.parentNode;
    const i = n ? [...doc.children].indexOf(n) : -1;
    return (i >= 0 && kidPage[i] != null) ? String(window.eqPageLabel ? window.eqPageLabel(kidPage[i]) : kidPage[i] + 1) : '';
  }
  const ensureId = e => { let id = e.getAttribute('data-id'); if (!id) { id = uid(); e.setAttribute('data-id', id); } return id; };

  /* ---------- table of contents / lists ---------- */
  function renderToc(div) {
    const kind = div.getAttribute('data-toc') || 'toc';
    let title, rows;
    if (kind === 'toc') { title = 'Table of Contents'; rows = headingList().map(h => ({ t: (hnumOn() && h.num ? h.num + '  ' : '') + h.text, lvl: h.level, el: h.el })); }
    else { title = kind === 'figure' ? 'List of Figures' : 'List of Tables'; rows = captionList(kind).map(c => ({ t: capLabel(c) + ': ' + c.text, lvl: 1, el: c.el })); }
    const html = '<div class="eq-toc-title">' + title + '</div>' + (rows.length
      ? rows.map((r, i) => '<div class="eq-toc-row l' + r.lvl + '" data-i="' + i + '"><span class="tt">' + esc(r.t) + '</span><span class="td"></span><span class="tp">' + pageOf(r.el) + '</span></div>').join('')
      : '<div class="eq-toc-empty">' + (kind === 'toc' ? 'No headings yet. Apply the Heading 1, 2 or 3 style to your chapter titles.' : 'Nothing here yet. Use References → Insert Caption.') + '</div>');
    div._rows = rows;
    if (div._html !== html) { div.innerHTML = html; div._html = html; return true; }
    return false;
  }
  doc.addEventListener('click', e => {
    const row = e.target.closest && e.target.closest('.eq-toc-row');
    if (row) { const d = row.closest('.eq-toc'), r = d && d._rows && d._rows[+row.dataset.i]; if (r && r.el) r.el.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const x = e.target.closest && e.target.closest('.eq-xref');
    if (x) { const t = doc.querySelector('[data-id="' + x.getAttribute('data-ref') + '"]'); if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });
  function insertToc(kind) {
    const d = el('div', 'eq-toc'); d.setAttribute('data-toc', kind); d.setAttribute('contenteditable', 'false');
    const tail = B.insertBlock(d); renderToc(d); afterChange(true); B.setCaret(tail, false);
  }
  bindPanel($('#btnToc'), simpleMenu([
    ['Table of Contents', '', () => insertToc('toc')], ['List of Figures', '', () => insertToc('figure')],
    ['List of Tables', '', () => insertToc('table')], ['Update everything', '', () => { updateAll(true); showToast('Updated'); }]
  ]));
  on($('#btnTocUpdate'), 'click', () => { updateAll(true); showToast('Updated'); });
  function syncHnum() { $('#btnHnum').classList.toggle('on', hnumOn()); }
  on($('#btnHnum'), 'click', () => { root.classList.toggle('hnum'); store.set('hnum', hnumOn() ? '1' : '0'); syncHnum(); updateAll(true); schedulePaginate(); });
  root.classList.toggle('hnum', store.get('hnum') === '1'); syncHnum();

  /* ---------- captions and cross-references ---------- */
  function insertCaption(kind, target) {
    const base = target || B.blockAtCaret();
    const obj = base && (base.matches && base.matches('.eq-chart,table,p.eq-figure')) ? base : null;
    const cap = el('p', 'eq-caption'); cap.setAttribute('data-cap', kind); cap.setAttribute('data-id', uid()); cap.textContent = 'Caption text';
    if (obj) { if (kind === 'table') obj.before(cap); else obj.after(cap); }
    else { const tail = B.insertBlock(cap); void tail; }
    afterChange(true); B.setCaret(cap, true);
  }
  window.eqInsertCaption = insertCaption;
  bindPanel($('#btnCaption'), simpleMenu([['Figure (below a picture or chart)', '', () => insertCaption('figure')], ['Table (above a table)', '', () => insertCaption('table')]]));

  function refLabel(t) {
    if (!t) return 'Error! Reference not found.';
    if (t.matches('p.eq-caption')) return (t.getAttribute('data-cap') === 'figure' ? 'Figure ' : 'Table ') + (t.getAttribute('data-num') || '?');
    if (t.matches('.eq-eqn')) return '(' + (t.getAttribute('data-num') || '?') + ')';
    if (t.matches('p.eq-th')) return (t.getAttribute('data-label') || 'Theorem').replace(/\.$/, '');
    if (/^H[1-3]$/.test(t.tagName)) { const h = headingList().find(x => x.el === t); return h ? ((hnumOn() && h.num) ? 'Section ' + h.num : h.text) : text(t); }
    return text(t);
  }
  function openXref() {
    const items = [];
    headingList().forEach(h => items.push({ el: h.el, tag: (hnumOn() ? h.num : 'Heading ' + h.level), t: h.text }));
    ['figure', 'table'].forEach(k => captionList(k).forEach(c => items.push({ el: c.el, tag: capLabel(c), t: c.text })));
    $$('.eq-eqn', doc).forEach(e => items.push({ el: e, tag: '(' + (e.getAttribute('data-num') || '?') + ')', t: 'Equation' }));
    $$('p.eq-th:not(.eq-th-c)[data-num]', doc).forEach(e => items.push({ el: e, tag: (e.getAttribute('data-label') || '').replace(/\.$/, ''), t: text(e).slice(0, 70) }));
    const ov = el('div', 'eqmodal open'), card = el('div', 'eqmodal-card'); card.style.width = '460px';
    card.innerHTML = '<h3>Cross-reference</h3><div class="fld-hint">Choose what to refer to. The number updates by itself when things move.</div>';
    const list = el('div', 'xr-list');
    if (!items.length) list.appendChild(el('div', 'xr-item', 'Nothing to refer to yet. Add headings or captions first.'));
    items.forEach(it => {
      const row = el('div', 'xr-item', '<b>' + esc(it.tag) + '</b><span>' + esc(it.t.slice(0, 80)) + '</span>');
      row.addEventListener('click', () => {
        ov.remove(); eqRestoreSel();
        const id = ensureId(it.el);
        document.execCommand('insertHTML', false, '<span class="eq-xref" data-ref="' + id + '" contenteditable="false">' + esc(refLabel(it.el)) + '</span>&nbsp;');
        afterChange(true);
      });
      list.appendChild(row);
    });
    card.appendChild(list);
    const a = el('div', 'eqmodal-actions'), c = el('button', 'btn', 'Close'); c.type = 'button'; c.addEventListener('click', () => ov.remove()); a.appendChild(c); card.appendChild(a);
    ov.appendChild(card); ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
    ov.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') ov.remove(); });
    document.body.appendChild(ov);
  }
  on($('#btnXref'), 'click', openXref);
  const insXref = $('#btnXrefIns'); if (insXref) on(insXref, 'click', openXref);
  function refreshXrefs() {
    $$('.eq-xref', doc).forEach(x => {
      const t = doc.querySelector('[data-id="' + x.getAttribute('data-ref') + '"]'), lab = refLabel(t);
      if (x.textContent !== lab) x.textContent = lab;
    });
  }

  /* ---------- sources, citations, bibliography ---------- */
  const getSources = () => { try { const a = JSON.parse(store.get('eqSources') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const putSources = a => store.set('eqSources', JSON.stringify(a));
  const getStyle = () => ['apa', 'harvard', 'ieee'].includes(store.get('eqCiteStyle')) ? store.get('eqCiteStyle') : 'apa';
  const parseAuthors = t => (t || '').split(/\n|;/).map(s => s.trim()).filter(Boolean).map(s => {
    if (s.includes(',')) { const p = s.split(','); return { last: p.shift().trim(), first: p.join(',').trim() }; }
    const p = s.split(/\s+/); return { last: p.pop(), first: p.join(' ') };
  });
  const initials = f => (f || '').split(/[\s-]+/).filter(Boolean).map(w => w[0].toUpperCase() + '.').join(' ');
  const fix = s => s.replace(/<i>\s*<\/i>/g, '').replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').replace(/,\s*([.,])/g, '$1').trim();
  function auStr(list, style) {
    if (!list.length) return '';
    if (style === 'ieee') {
      const n = list.map(a => (a.first ? initials(a.first) + ' ' : '') + a.last);
      if (n.length > 6) return n[0] + ' et al.'; if (n.length === 1) return n[0]; if (n.length === 2) return n[0] + ' and ' + n[1];
      return n.slice(0, -1).join(', ') + ', and ' + n[n.length - 1];
    }
    if (style === 'harvard') {
      const n = list.map(a => a.last + (a.first ? ', ' + initials(a.first).replace(/ /g, '') : ''));
      return n.length === 1 ? n[0] : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
    }
    const n = list.map(a => a.last + (a.first ? ', ' + initials(a.first) : ''));
    if (n.length === 1) return n[0];
    return n.length <= 20 ? n.slice(0, -1).join(', ') + ', & ' + n[n.length - 1] : n.slice(0, 19).join(', ') + ', ... ' + n[n.length - 1];
  }
  function entry(s, style) {
    if (s.raw) return esc(s.raw);
    const au = auStr(parseAuthors(s.authors), style) || (style === 'ieee' ? 'Anonymous' : 'Anonymous');
    const y = esc(s.year || 'n.d.'), t = esc(s.title), c = esc(s.container), p = esc(s.publisher), url = esc(s.url), vol = esc(s.volume), iss = esc(s.issue), pg = esc(s.pages);
    let out;
    if (style === 'ieee') {
      const v = vol ? ', vol. ' + vol : '', n = iss ? ', no. ' + iss : '', pp = pg ? ', pp. ' + pg : '';
      out = ({
        article: au + ', “' + t + ',” <i>' + c + '</i>' + v + n + pp + ', ' + y + '. ' + url,
        book: au + ', <i>' + t + '</i>. ' + p + ', ' + y + '. ' + url,
        conf: au + ', “' + t + ',” in <i>' + c + '</i>, ' + y + pp + '. ' + url,
        thesis: au + ', “' + t + ',” ' + c + ', ' + y + '. ' + url,
        web: au + ', “' + t + ',” ' + c + ', ' + y + '. ' + url
      })[s.type] || au + ', “' + t + ',” ' + (p || c) + ', ' + y + '. ' + url;
    } else if (style === 'harvard') {
      const j = vol ? ', ' + vol + (iss ? '(' + iss + ')' : '') : '', pp = pg ? ', pp. ' + pg : '', av = url ? ' Available at: ' + url + '.' : '';
      out = ({
        article: au + ' (' + y + ') ‘' + t + '’, <i>' + c + '</i>' + j + pp + '.' + av,
        book: au + ' (' + y + ') <i>' + t + '</i>. ' + p + '.' + av,
        conf: au + ' (' + y + ') ‘' + t + '’, in <i>' + c + '</i>' + pp + '. ' + p + '.' + av,
        thesis: au + ' (' + y + ') <i>' + t + '</i>. ' + c + '.' + av,
        web: au + ' (' + y + ') <i>' + t + '</i>. ' + c + '.' + av
      })[s.type] || au + ' (' + y + ') <i>' + t + '</i>. ' + (p || c) + '.' + av;
    } else {
      const j = vol ? ', <i>' + vol + '</i>' + (iss ? '(' + iss + ')' : '') : '', pp = pg ? ', ' + pg : '';
      out = ({
        article: au + ' (' + y + '). ' + t + '. <i>' + c + '</i>' + j + pp + '. ' + url,
        book: au + ' (' + y + '). <i>' + t + '</i>. ' + p + '. ' + url,
        conf: au + ' (' + y + '). ' + t + '. In <i>' + c + '</i>' + (pg ? ' (pp. ' + pg + ')' : '') + '. ' + p + '. ' + url,
        thesis: au + ' (' + y + '). <i>' + t + '</i> [Thesis, ' + c + ']. ' + url,
        web: au + ' (' + y + '). <i>' + t + '</i>. ' + c + '. ' + url
      })[s.type] || au + ' (' + y + '). <i>' + t + '</i>. ' + (p || c) + '. ' + url;
    }
    return fix(out);
  }
  function citeText(s, style, n) {
    if (style === 'ieee') return '[' + n + ']';
    const names = parseAuthors(s.authors).map(a => a.last), y = s.year || 'n.d.';
    const who = !names.length ? (s.title || 'Anonymous').slice(0, 30) : names.length === 1 ? names[0] : names.length === 2 ? names[0] + (style === 'apa' ? ' & ' : ' and ') + names[1] : names[0] + ' et al.';
    return style === 'apa' ? '(' + who + ', ' + y + ')' : '(' + who + ' ' + y + ')';
  }
  const citeOrder = () => { const seen = []; $$('.eq-cite', doc).forEach(c => { const id = c.getAttribute('data-src'); if (!seen.includes(id)) seen.push(id); }); return seen; };
  function refreshCites() {
    const src = getSources(), style = getStyle(), order = citeOrder();
    $$('.eq-cite', doc).forEach(c => {
      const id = c.getAttribute('data-src'), s = src.find(x => x.id === id);
      const t = s ? citeText(s, style, order.indexOf(id) + 1) : '(source removed)';
      if (c.textContent !== t) c.textContent = t;
    });
  }
  function renderBib(div) {
    const src = getSources(), style = getStyle(), order = citeOrder();
    let list = order.map(id => src.find(s => s.id === id)).filter(Boolean);
    if (!list.length) list = src.slice();
    if (style !== 'ieee') list.sort((a, b) => ((parseAuthors(a.authors)[0] || { last: a.title || '' }).last + (a.year || '')).localeCompare((parseAuthors(b.authors)[0] || { last: b.title || '' }).last + (b.year || '')));
    const html = list.length ? list.map((s, i) => '<div class="eq-bib-row">' + (style === 'ieee' ? '[' + (i + 1) + '] ' : '') + entry(s, style) + '</div>').join('') : '<div class="eq-toc-empty">No sources yet. Use References → Manage Sources.</div>';
    if (div._html !== html) { div.innerHTML = html; div._html = html; return true; }
    return false;
  }
  function insertBibliography() {
    const h = el('h1', '', 'References'), d = el('div', 'eq-bib'); d.setAttribute('data-bib', '1'); d.setAttribute('contenteditable', 'false');
    const tail = B.insertBlock(h); tail.before(d); renderBib(d); afterChange(true); B.setCaret(tail, false);
  }
  on($('#btnBib'), 'click', insertBibliography);

  const selStyle = $('#selCiteStyle'); selStyle.value = getStyle();
  selStyle.addEventListener('change', () => { store.set('eqCiteStyle', selStyle.value); updateAll(true); });
  bindPanel($('#btnCite'), () => {
    const src = getSources();
    if (!src.length) { setTimeout(openSources, 0); return el('div', 'dropdown-panel'); }
    return simpleMenu(src.map(s => [srcLabel(s), '', () => {
      eqRestoreSel();
      document.execCommand('insertHTML', false, '<span class="eq-cite" data-src="' + s.id + '" contenteditable="false">' + esc(citeText(s, getStyle(), citeOrder().length + 1)) + '</span>&nbsp;');
      afterChange(true);
    }]));
  });
  const srcLabel = s => { const a = parseAuthors(s.authors)[0]; return (a ? a.last : 'Unknown') + ' (' + (s.year || 'n.d.') + ') ' + (s.title || '').slice(0, 36); };

  function openSources() {
    const ov = el('div', 'eqmodal open'), card = el('div', 'eqmodal-card srcm-card');
    card.innerHTML = '<h3>Manage Sources</h3><div class="srcm"><div class="srcm-list"><div id="smList"></div><button class="btn" id="smAdd" type="button">+ Add source</button><button class="btn" id="smImport" type="button">Import .bib file</button></div><div class="srcm-form" id="smForm"></div></div><div class="eqmodal-actions"><button class="btn btn-primary" id="smDone" type="button">Done</button></div>';
    ov.appendChild(card); document.body.appendChild(ov);
    let sel = null; const list = card.querySelector('#smList'), form = card.querySelector('#smForm');
    const TYPES = [['book', 'Book'], ['article', 'Journal article'], ['conf', 'Conference paper'], ['thesis', 'Thesis / dissertation'], ['web', 'Website'], ['report', 'Report']];
    const F = [['authors', 'Authors (one per line: Last, First)', 'textarea'], ['year', 'Year'], ['title', 'Title'], ['container', 'Journal / Website / Conference / Institution'], ['publisher', 'Publisher'], ['volume', 'Volume'], ['issue', 'Issue'], ['pages', 'Pages (e.g. 12-34)'], ['url', 'URL or DOI']];
    function drawList() {
      const src = getSources(); list.innerHTML = '';
      if (!src.length) list.appendChild(el('div', 'fld-hint', 'No sources yet.'));
      src.forEach(s => { const d = el('div', 'srcm-item' + (s.id === sel ? ' on' : ''), esc(srcLabel(s))); d.addEventListener('click', () => { sel = s.id; drawList(); drawForm(); }); list.appendChild(d); });
    }
    function drawForm() {
      const src = getSources(), s = src.find(x => x.id === sel); form.innerHTML = '';
      if (!s) { form.appendChild(el('div', 'fld-hint', 'Add a source, or pick one on the left.')); return; }
      const tw = el('div', 'fld', '<span>Type</span>'), ts = el('select');
      TYPES.forEach(t => { const o = el('option'); o.value = t[0]; o.textContent = t[1]; ts.appendChild(o); }); ts.value = s.type || 'book';
      ts.addEventListener('change', () => { s.type = ts.value; putSources(src); }); tw.appendChild(ts); form.appendChild(tw);
      const grid = el('div', 'srcm-2');
      F.forEach(f => {
        const w = el('div', 'fld', '<span>' + esc(f[1]) + '</span>'); if (f[2] === 'textarea') w.style.gridColumn = '1 / -1';
        const inp = f[2] === 'textarea' ? el('textarea') : el('input'); if (f[2] === 'textarea') inp.rows = 3; inp.value = s[f[0]] || '';
        inp.addEventListener('input', () => { s[f[0]] = inp.value; putSources(src); const it = list.querySelector('.srcm-item.on'); if (it) it.textContent = srcLabel(s); });
        w.appendChild(inp); grid.appendChild(w);
      });
      form.appendChild(grid);
      const del = el('button', 'btn', 'Delete this source'); del.type = 'button'; del.style.marginTop = '8px';
      del.addEventListener('click', () => { putSources(src.filter(x => x.id !== s.id)); sel = null; drawList(); drawForm(); });
      form.appendChild(del);
    }
    card.querySelector('#smAdd').addEventListener('click', () => {
      const src = getSources(), s = { id: uid(), type: 'book', authors: '', year: '', title: '', container: '', publisher: '', volume: '', issue: '', pages: '', url: '' };
      src.push(s); putSources(src); sel = s.id; drawList(); drawForm();
    });
    card.querySelector('#smImport').addEventListener('click', () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.bib,.txt';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          const list = window.eqParseBib ? window.eqParseBib(String(r.result)) : [];
          if (!list.length) return showToast('No entries found in that file', 'warn');
          const src = getSources(), keys = new Set(src.map(s => (s.title + '|' + s.year).toLowerCase()));
          let n = 0;
          list.forEach(s => { const k = (s.title + '|' + s.year).toLowerCase(); if (!keys.has(k)) { src.push(s); keys.add(k); n++; } });
          putSources(src); sel = src.length ? src[src.length - 1].id : null; drawList(); drawForm();
          showToast(n + ' source' + (n === 1 ? '' : 's') + ' imported');
        };
        r.readAsText(f);
      });
      inp.click();
    });
    const done = () => { ov.remove(); updateAll(true); };
    card.querySelector('#smDone').addEventListener('click', done);
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(); });
    ov.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') done(); });
    const first = getSources()[0]; if (first) sel = first.id; drawList(); drawForm();
  }
  on($('#btnSources'), 'click', openSources);

  /* ---------- keep everything up to date ---------- */
  let updating = false, changed = false;
  function updateAll(force) {
    if (updating) return;
    updating = true; changed = false;
    try {
      if (window.eqCore) eqCore.renumber();
      (window.eqHooks || []).forEach(f => { try { if (f()) changed = true; } catch (e) { reportError('hook', e); } });
      refreshCites();
      $$('.eq-bib', doc).forEach(d => { if (renderBib(d)) changed = true; });
      refreshXrefs();
      $$('.eq-toc', doc).forEach(d => { if (renderToc(d)) changed = true; });
    } catch (e) { reportError('references', e); }
    mo.takeRecords();
    updating = false;
    if (changed || force) { scheduleSave(); schedulePaginate(); }
  }
  let t = 0;
  const schedule = () => { clearTimeout(t); t = setTimeout(updateAll, 400); };
  const mo = new MutationObserver(recs => {
    if (updating) return;
    if (recs.every(r => r.target.nodeType === 1 && r.target.closest && r.target.closest('.eq-toc,.eq-bib,.eq-abbr,.eq-symlist,.eq-notes'))) return;
    schedule();
  });
  mo.observe(doc, { childList: true, characterData: true, subtree: true });
  window.eqAfterPaginate = schedule;
  window.eqUpdateAll = updateAll;
  const baseRestore = window.restoreDoc;
  if (typeof baseRestore === 'function') window.restoreDoc = function () { const r = baseRestore.apply(this, arguments); setTimeout(() => updateAll(), 0); return r; };
  updateAll();
})();