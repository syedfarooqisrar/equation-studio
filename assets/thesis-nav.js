/* 📁 FILE: assets/thesis-nav.js
   Left panel: Navigation (headings, move chapters), Dashboard (words, goals), Thesis Check.
   Also: Focus mode and Save / Open project file. */
'use strict';
(function () {
  const esc = eqEsc, el = eqEl;
  const panel = $('#navPanel'), body = $('#navBody'), shell = $('#wsShell');
  const SKIP = '.eq-toc,.eq-bib,.eq-abbr,.eq-symlist,.eq-notes,.eq-pagebreak,.eq-chart';
  let tab = 'outline';
  const txt = n => (n.textContent || '').replace(/\u200B/g, '').replace(/\u00A0/g, ' ').trim();
  const wc = n => { const t = txt(n); return t ? t.split(/\s+/).length : 0; };
  const blocks = () => [...doc.children];
  const bodyBlocks = () => blocks().filter(b => !b.matches(SKIP));
  const totalWords = () => bodyBlocks().reduce((a, b) => a + wc(b), 0);
  const posInt = (k, d) => { const v = parseInt(store.get(k), 10); return v > 0 ? v : d; };
  const fnum = n => Number(n).toLocaleString('en-US');
  const sources = () => { try { const a = JSON.parse(store.get('eqSources') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  function flash(e) {
    if (!e) return;
    e.scrollIntoView({ block: 'center', behavior: 'smooth' });
    e.classList.add('eq-flash'); setTimeout(() => e.classList.remove('eq-flash'), 1400);
  }
  $$('.eq-flash', doc).forEach(e => e.classList.remove('eq-flash'));
  window.addEventListener('beforeunload', () => $$('.eq-flash', doc).forEach(e => e.classList.remove('eq-flash')));

  /* ---------- Headings ---------- */
  const sectionNodes = h => {
    const lv = +h.tagName[1], out = [h];
    let n = h.nextElementSibling;
    while (n && !(/^H[1-3]$/.test(n.tagName) && +n.tagName[1] <= lv)) { out.push(n); n = n.nextElementSibling; }
    return out;
  };
  const sectionWords = h => sectionNodes(h).filter(n => !n.matches(SKIP)).reduce((a, n) => a + wc(n), 0);
  function moveSection(h, dir) {
    const lv = +h.tagName[1], nodes = sectionNodes(h);
    serialize();
    let moved = false;
    if (dir < 0) {
      let p = h.previousElementSibling, target = null;
      while (p) {
        if (/^H[1-3]$/.test(p.tagName)) { const pl = +p.tagName[1]; if (pl < lv) break; if (pl === lv) { target = p; break; } }
        p = p.previousElementSibling;
      }
      if (target) { target.before(...nodes); moved = true; }
    } else {
      const n = nodes[nodes.length - 1].nextElementSibling;
      if (n && /^H[1-3]$/.test(n.tagName) && +n.tagName[1] === lv) { const nx = sectionNodes(n); nx[nx.length - 1].after(...nodes); moved = true; }
    }
    if (!moved) return showToast('It cannot move further', 'warn');
    nodes.forEach(n => { if (n.querySelectorAll) n.querySelectorAll('math-field').forEach(m => { const v = m.getAttribute('value'); if (v != null) { try { m.value = v; } catch (e) { /* keeps its content */ } } }); });
    afterChange(true); flash(h);
  }
  function renderOutline() {
    body.innerHTML = '';
    const hs = $$('h1,h2,h3', doc);
    if (!hs.length) { body.appendChild(el('div', 'nav-empty', 'No headings yet. Give your chapter and section titles the Heading 1, 2 or 3 style (Home tab).')); return; }
    const useNum = root.classList.contains('hnum'), c = [0, 0, 0];
    hs.forEach(h => {
      const lv = +h.tagName[1];
      let num = '';
      if (!h.classList.contains('eq-unnum')) { c[lv - 1]++; for (let k = lv; k < 3; k++) c[k] = 0; num = c.slice(0, lv).join('.'); }
      const row = el('div', 'nav-row l' + lv);
      const t = el('span', 'nav-t', esc((useNum && num ? num + '  ' : '') + (txt(h) || '(empty heading)')));
      t.addEventListener('click', () => flash(h));
      const w = el('span', 'nav-w', fnum(sectionWords(h)) + ' w');
      const mv = el('span', 'nav-mv');
      [['▲', -1, 'Move this section up'], ['▼', 1, 'Move this section down']].forEach(([s, d, tip]) => {
        const b = el('button', '', s); b.type = 'button'; b.title = tip; b.addEventListener('click', e => { e.stopPropagation(); moveSection(h, d); }); mv.appendChild(b);
      });
      row.appendChild(t); row.appendChild(w); row.appendChild(mv); body.appendChild(row);
    });
  }

  /* ---------- Dashboard ---------- */
  function renderDash() {
    const words = totalWords();
    const chars = bodyBlocks().reduce((a, b) => a + txt(b).replace(/\s/g, '').length, 0);
    const goal = posInt('eqGoal', 20000), dayGoal = posInt('eqDayGoal', 500), today = new Date().toISOString().slice(0, 10);
    let day; try { day = JSON.parse(store.get('eqDay') || 'null'); } catch (e) { day = null; }
    if (!day || day.d !== today) { day = { d: today, base: words }; store.set('eqDay', JSON.stringify(day)); }
    const written = words - day.base, pct = Math.min(100, Math.round(words / goal * 100)), dpct = Math.max(0, Math.min(100, Math.round(written / dayGoal * 100)));
    const eqs = $$('math-field', doc).filter(m => !m.closest('.eq-symlist')).length;
    const figs = $$('p.eq-caption[data-cap="figure"]', doc).length, tabs = $$('table.eq-table', doc).length, cites = $$('.eq-cite', doc).length;
    const pages = (typeof layout !== 'undefined' && layout === 'print') ? pageCount : '–';
    const h1s = $$('h1', doc).filter(h => !h.classList.contains('eq-unnum')).map(h => ({ t: txt(h) || '(empty)', w: sectionWords(h) }));
    const maxW = Math.max(1, ...h1s.map(x => x.w));
    body.innerHTML =
      '<div class="dash-card"><div class="dash-big">' + fnum(words) + '<small> words</small></div><div class="dash-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="dash-sub">' + pct + '% of <input type="number" id="dGoal" min="100" value="' + goal + '"> word goal</div></div>' +
      '<div class="dash-card"><div class="dash-lab">Today</div><div class="dash-big">' + (written >= 0 ? '+' : '') + fnum(written) + '<small> words</small></div><div class="dash-bar"><i style="width:' + dpct + '%"></i></div>' +
      '<div class="dash-sub">Daily goal <input type="number" id="dDay" min="50" value="' + dayGoal + '"></div></div>' +
      '<div class="dash-grid"><div><b>' + pages + '</b><span>pages</span></div><div><b>' + eqs + '</b><span>equations</span></div><div><b>' + figs + '</b><span>figures</span></div><div><b>' + tabs + '</b><span>tables</span></div><div><b>' + cites + '</b><span>citations</span></div><div><b>' + sources().length + '</b><span>sources</span></div><div><b>' + fnum(chars) + '</b><span>characters</span></div><div><b>' + Math.max(1, Math.round(words / 200)) + '</b><span>min to read</span></div></div>' +
      '<div class="dash-lab" style="margin-top:12px">By chapter</div>' +
      (h1s.length ? h1s.map(x => '<div class="dash-ch"><span>' + esc(x.t) + '</span><em>' + fnum(x.w) + '</em><div class="dash-bar sm"><i style="width:' + Math.round(x.w / maxW * 100) + '%"></i></div></div>').join('') : '<div class="nav-empty">Chapters (Heading 1) will be listed here.</div>');
    const g = $('#dGoal'), d = $('#dDay');
    if (g) g.addEventListener('change', () => { store.set('eqGoal', String(Math.max(100, parseInt(g.value, 10) || 20000))); renderDash(); });
    if (d) d.addEventListener('change', () => { store.set('eqDayGoal', String(Math.max(50, parseInt(d.value, 10) || 500))); renderDash(); });
    g && g.addEventListener('keydown', e => e.stopPropagation()); d && d.addEventListener('keydown', e => e.stopPropagation());
  }

  /* ---------- Thesis Check ---------- */
  function runCheck() {
    const out = [], add = (sev, msg, e) => out.push({ sev, msg, e });
    const bl = blocks(), isCap = x => !!(x && x.matches && x.matches('p.eq-caption'));
    bl.forEach((b, i) => {
      if (b.matches('p.eq-figure,.eq-chart') && !isCap(bl[i + 1]) && !isCap(bl[i - 1])) add('warn', 'A picture or chart has no caption.', b);
      if (b.matches('table.eq-table') && !isCap(bl[i - 1]) && !isCap(bl[i + 1])) add('warn', 'A table has no caption.', b);
    });
    const referred = new Set($$('.eq-xref', doc).map(x => x.getAttribute('data-ref')));
    $$('p.eq-caption[data-cap]', doc).forEach(c => {
      if (!c.getAttribute('data-id') || !referred.has(c.getAttribute('data-id'))) add('info', (c.getAttribute('data-cap') === 'figure' ? 'Figure ' : 'Table ') + (c.getAttribute('data-num') || '') + ' is never mentioned in the text (use Cross-reference).', c);
    });
    if ($$('.eq-eqn', doc).length) {
      const loose = bl.filter(b => b.tagName === 'P' && b.querySelectorAll('math-field').length === 1 && !txt(b));
      if (loose.length) add('info', loose.length + ' equation(s) on their own line are not numbered.', loose[0]);
    }
    const src = sources(), used = new Set($$('.eq-cite', doc).map(c => c.getAttribute('data-src')));
    src.forEach(s => { if (!used.has(s.id)) add('info', 'Source “' + (s.title || 'Untitled').slice(0, 50) + '” is in your list but never cited.', null); });
    $$('.eq-cite', doc).forEach(c => { if (!src.some(s => s.id === c.getAttribute('data-src'))) add('warn', 'A citation points to a source that was removed.', c); });
    if ($$('.eq-cite', doc).length && !$$('.eq-bib', doc).length) add('warn', 'You have citations but no Bibliography (References → Bibliography).', null);
    const hs = $$('h1,h2,h3', doc);
    if (hs.length >= 3 && !$$('.eq-toc[data-toc="toc"]', doc).length) add('info', 'There is no Table of Contents yet.', hs[0]);
    let prev = 0;
    hs.forEach(h => {
      const lv = +h.tagName[1];
      if (!txt(h)) add('warn', 'A heading is empty.', h);
      if (prev && lv - prev > 1) add('warn', 'Heading levels jump from ' + prev + ' to ' + lv + ': “' + txt(h).slice(0, 40) + '”.', h);
      prev = lv;
    });
    let dbl = 0, dblEl = null;
    const PLACE = ['Caption text', 'Author Name', 'THESIS TITLE GOES HERE', 'Dr. Supervisor Name', 'University Name', 'Subtitle or course name', 'Department Name', 'Report Title', 'Thesis Title'];
    bodyBlocks().forEach(b => {
      if (!/^(P|H1|H2|H3)$/.test(b.tagName)) return;
      const t = txt(b);
      if (/\S {2,}\S/.test((b.textContent || '').replace(/\u00A0/g, ' '))) { dbl++; dblEl = dblEl || b; }
      const rep = t.match(/\b([A-Za-z]{2,})\s+\1\b/i);
      if (rep && out.filter(o => o.msg.startsWith('Repeated')).length < 10) add('warn', 'Repeated word: “' + rep[0] + '”.', b);
      if (wc(b) > 250) add('info', 'A very long paragraph (' + wc(b) + ' words). Consider splitting it.', b);
      PLACE.forEach(p => { if (t.includes(p)) add('warn', 'Placeholder text left: “' + p + '”.', b); });
    });
    if (dbl) add('info', dbl + ' paragraph(s) contain double spaces.', dblEl);
    return out;
  }
  function renderCheck() {
    const list = runCheck(), warn = list.filter(x => x.sev === 'warn').length;
    body.innerHTML = '<div class="chk-head"><button class="btn btn-primary" id="chkRun" type="button">Run check again</button><span>' + (list.length ? warn + ' to fix · ' + (list.length - warn) + ' suggestions' : '') + '</span></div>';
    if (!list.length) body.appendChild(el('div', 'chk-ok', '✓ No problems found. Nice work.'));
    list.sort((a, b) => (a.sev === 'warn' ? 0 : 1) - (b.sev === 'warn' ? 0 : 1)).forEach(it => {
      const r = el('div', 'chk-row ' + it.sev, '<i>' + (it.sev === 'warn' ? '!' : 'i') + '</i><span>' + esc(it.msg) + '</span>');
      if (it.e) { r.classList.add('go'); r.addEventListener('click', () => flash(it.e)); }
      body.appendChild(r);
    });
    $('#chkRun').addEventListener('click', renderCheck);
  }

  /* ---------- panel plumbing ---------- */
  const isOpen = () => shell.classList.contains('nav-open');
  function render() { if (!isOpen()) return; $$('[data-nt]', panel).forEach(b => b.classList.toggle('on', b.dataset.nt === tab)); (tab === 'dash' ? renderDash : tab === 'check' ? renderCheck : renderOutline)(); }
  function show(t) { if (isOpen() && tab === t) shell.classList.remove('nav-open'); else { tab = t; shell.classList.add('nav-open'); render(); } }
  $$('[data-nt]', panel).forEach(b => on(b, 'click', () => { tab = b.dataset.nt; render(); }));
  on($('#navClose'), 'click', () => shell.classList.remove('nav-open'));
  on($('#btnNav'), 'click', () => show('outline'));
  on($('#btnDash'), 'click', () => show('dash'));
  on($('#btnCheck'), 'click', () => show('check'));
  let t = 0;
  new MutationObserver(() => { if (!isOpen() || tab === 'check') return; clearTimeout(t); t = setTimeout(render, 900); }).observe(doc, { childList: true, characterData: true, subtree: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen() && !document.querySelector('.eqmodal.open')) shell.classList.remove('nav-open'); });

  /* ---------- Focus mode ---------- */
  const pill = $('#focusPill');
  function setFocus(on_) { root.classList.toggle('focus', on_); pill.hidden = !on_; schedulePaginate(); }
  on($('#btnFocus'), 'click', () => setFocus(true));
  on(pill, 'click', () => setFocus(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('focus')) setFocus(false); });

  /* ---------- Save / Open project file ---------- */
  const KEYS = ['eqSources', 'eqCiteStyle', 'eqHF', 'eqMargins', 'eqAbbr', 'eqSym', 'hnum', 'eqGoal', 'eqDayGoal', 'layoutMode', 'pageSize', 'copyMode'];
  function saveProject() {
    try { saveNow(); } catch (e) { /* the file is built from the live document anyway */ }
    const keys = {}; KEYS.forEach(k => { const v = store.get(k); if (typeof v === 'string') keys[k] = v; });
    const data = { app: 'equation-studio', v: 1, saved: new Date().toISOString(), html: serialize(), keys };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'thesis-' + new Date().toISOString().slice(0, 10) + '.eqproj';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function confirmBox(msg, ok) {
    const ov = el('div', 'eqmodal open'), card = el('div', 'eqmodal-card');
    card.innerHTML = '<h3>Open project?</h3><p class="help-text">' + esc(msg) + '</p>';
    const a = el('div', 'eqmodal-actions'), c = el('button', 'btn', 'Cancel'), o = el('button', 'btn btn-primary', 'Open');
    c.type = o.type = 'button'; c.addEventListener('click', () => ov.remove()); o.addEventListener('click', () => { ov.remove(); ok(); });
    a.appendChild(c); a.appendChild(o); card.appendChild(a); ov.appendChild(card); document.body.appendChild(ov);
    ov.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') ov.remove(); });
  }
  function openProject() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.eqproj,application/json';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 60e6) return showToast('That file is too large', 'warn');
      const r = new FileReader();
      r.onload = () => {
        let d;
        try { d = JSON.parse(String(r.result)); if (!d || d.app !== 'equation-studio' || typeof d.html !== 'string') throw new Error('bad'); }
        catch (e) { return showToast('This is not an Equation Studio project file', 'error'); }
        confirmBox('“' + f.name + '” will replace the document that is open now. Save your current work first if you still need it.', () => {
          if (!store.set('savedDocument', d.html)) return showToast('This project is too large to open here', 'error');
          KEYS.forEach(k => { if (d.keys && typeof d.keys[k] === 'string' && d.keys[k].length < 3e6) store.set(k, d.keys[k]); });
          location.reload();
        });
      };
      r.readAsText(f);
    });
    inp.click();
  }
  on($('#btnSaveProj'), 'click', saveProject);
  on($('#btnOpenProj'), 'click', openProject);
})();
