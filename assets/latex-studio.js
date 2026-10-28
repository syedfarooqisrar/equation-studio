/* 📁 FILE: assets/latex-studio.js
   LaTeX Studio: paste or type a complete LaTeX document, compile it, see the pages.
   Talks to tex_service.py through window.pyTexRequest / window.onTexResult.
   Uses globals from app.js / home.js: $, $$, on, store, showToast, bindPanel, simpleMenu, eqEl, eqEsc. */
'use strict';
(function () {
  const studio = $('#texStudio'), shell = $('#wsShell');
  const code = $('#txCode'), gutter = $('#txGutter'), pagesBox = $('#txPages'), statusEl = $('#txStatus');
  const probBox = $('#txProblems'), logRaw = $('#txLogRaw'), wdEl = $('#txWd');
  const el = eqEl, esc = eqEsc, LH = 20;
  let busy = false, queued = false, errors = [], reqId = 0, found = null, fileName = 'document.tex', loadedOnce = false;
  let autoT = 0, saveT = 0, started = 0, ticker = 0;

  /* ---------- templates ---------- */
  const SAMPLE = String.raw`\documentclass[12pt]{article}
\usepackage{amsmath,amssymb}
\usepackage[margin=1in]{geometry}

\title{Hello, LaTeX}
\author{Equation Studio}
\date{\today}

\begin{document}
\maketitle

\section{An equation}
The quadratic formula gives the roots of $ax^2+bx+c=0$:
\begin{equation}
  x = \frac{-b \pm \sqrt{b^{2}-4ac}}{2a}
\end{equation}

\section{A matrix and an integral}
\[
  A = \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}, \qquad
  \int_0^1 x^2\,dx = \frac{1}{3}.
\]

\end{document}
`;
  const TPL = {
    article: String.raw`\documentclass[12pt,a4paper]{article}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{graphicx}
\usepackage[margin=1in]{geometry}
\usepackage{hyperref}

\title{Title of the Article}
\author{Author Name}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Write a short summary here.
\end{abstract}

\section{Introduction}
Start writing here. Inline math looks like $E = mc^2$.

\section{Method}
\begin{equation}\label{eq:main}
  f(x) = \int_{-\infty}^{\infty} e^{-t^2}\,dt
\end{equation}
Equation~\ref{eq:main} is an example.

\section{Conclusion}
Summarise your results.

\end{document}
`,
    thesis: String.raw`\documentclass[12pt,a4paper]{report}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{graphicx}
\usepackage[left=1.5in,right=1in,top=1in,bottom=1in]{geometry}
\usepackage{setspace}
\usepackage{hyperref}
\onehalfspacing
\newtheorem{theorem}{Theorem}[chapter]
\newtheorem{definition}[theorem]{Definition}

\begin{document}

\begin{titlepage}
  \centering
  \vspace*{3cm}
  {\LARGE\bfseries Thesis Title Goes Here\par}
  \vspace{1.5cm}
  {\large A thesis submitted in partial fulfilment of the requirements for the degree of Master of Science\par}
  \vspace{1.5cm}
  {\Large Author Name\par}
  \vfill
  {\large Department Name\\University Name\\\today\par}
\end{titlepage}

\pagenumbering{roman}
\chapter*{Abstract}
\addcontentsline{toc}{chapter}{Abstract}
Write the abstract here.

\tableofcontents
\listoffigures
\listoftables
\clearpage
\pagenumbering{arabic}

\chapter{Introduction}
\section{Background}
Text of the introduction. See Chapter~\ref{ch:method}.

\chapter{Method}\label{ch:method}
\begin{definition}
A \emph{metric} is a function $d$ with $d(x,y)\ge 0$.
\end{definition}
\begin{equation}
  \nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}
\end{equation}

\chapter{Conclusion}
Final remarks.

\begin{thebibliography}{9}
\bibitem{knuth} Donald E. Knuth, \emph{The \TeX book}, Addison-Wesley, 1984.
\end{thebibliography}

\end{document}
`,
    math: String.raw`\documentclass[12pt]{article}
\usepackage{amsmath,amssymb,amsthm}
\usepackage[margin=1in]{geometry}
\newtheorem{theorem}{Theorem}
\newtheorem{lemma}[theorem]{Lemma}
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}

\title{Notes}
\author{Author Name}
\begin{document}
\maketitle

\begin{definition}
A set $S\subseteq\mathbb{R}$ is \emph{bounded} if there is $M>0$ with $|x|\le M$ for all $x\in S$.
\end{definition}

\begin{theorem}[Cauchy--Schwarz]
For vectors $u,v$ we have $|\langle u,v\rangle|\le \|u\|\,\|v\|$.
\end{theorem}
\begin{proof}
Consider $\|u-tv\|^2\ge 0$ for all real $t$ and minimise over $t$.
\end{proof}

\begin{align}
  (a+b)^2 &= a^2 + 2ab + b^2 \\
  \sum_{k=1}^{n} k &= \frac{n(n+1)}{2}
\end{align}
\end{document}
`,
    slides: String.raw`\documentclass{beamer}
\usetheme{Madrid}
\title{Presentation Title}
\author{Author Name}
\date{\today}

\begin{document}
\frame{\titlepage}

\begin{frame}{Outline}
  \tableofcontents
\end{frame}

\section{Introduction}
\begin{frame}{Introduction}
  \begin{itemize}
    \item First point
    \item Second point with math: $a^2+b^2=c^2$
  \end{itemize}
\end{frame}

\section{Results}
\begin{frame}{A formula}
  \[ \int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2} \]
\end{frame}
\end{document}
`
  };

  /* ---------- talking to Python ---------- */
  const outbox = [];
  function flush() {
    if (!outbox.length) return;
    if (window.pyTexRequest) { setTimeout(flush, 150); return; }
    window.pyTexRequest = outbox.shift();
    if (outbox.length) setTimeout(flush, 150);
  }
  const tx = obj => { outbox.push(JSON.stringify(obj)); flush(); };

  /* ---------- editor ---------- */
  function drawGutter() {
    const n = code.value.split('\n').length, bad = new Set(errors.map(e => e.line));
    let h = '';
    for (let i = 1; i <= n; i++) h += bad.has(i) ? '<b>' + i + '</b>\n' : i + '\n';
    gutter.innerHTML = '<pre>' + h + '</pre>';
    gutter.scrollTop = code.scrollTop;
  }
  function persist() { clearTimeout(saveT); saveT = setTimeout(() => store.set('eqTex', code.value), 800); }
  function gotoLine(line) {
    if (!line) return;
    const lines = code.value.split('\n');
    let start = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i++) start += lines[i].length + 1;
    const end = start + ((lines[line - 1] || '').length);
    code.focus(); code.setSelectionRange(start, end);
    code.scrollTop = Math.max(0, (line - 4) * LH);
  }
  on(code, 'input', () => {
    errors = []; drawGutter(); persist();
    if ($('#txAuto').checked) { clearTimeout(autoT); autoT = setTimeout(compile, 2500); }
  });
  on(code, 'scroll', () => { gutter.scrollTop = code.scrollTop; });
  code.addEventListener('keydown', e => {
    e.stopPropagation();                                           // typing here must not trigger the document's shortcuts
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = code.selectionStart, t = code.selectionEnd;
      code.setRangeText('  ', s, t, 'end');
      code.dispatchEvent(new Event('input'));
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); compile(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveTex(); }
  });

  /* ---------- status and preview ---------- */
  function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = cls || ''; }
  function setBusy(on_) {
    busy = on_;
    $('#txCompile').disabled = on_; $('#txStop').hidden = !on_;
    clearInterval(ticker);
    if (on_) { started = Date.now(); ticker = setInterval(() => setStatus('Compiling… ' + Math.round((Date.now() - started) / 1000) + ' s'), 500); }
  }
  function message(html) { pagesBox.innerHTML = ''; pagesBox.appendChild(el('div', 'tx-msg', html)); }
  const showBusyMsg = () => message('<div class="tx-spin"></div><b>Compiling…</b><br>The first compile can take a minute: Tectonic downloads the LaTeX packages it needs (internet required once). After that it is fast.');
  function noEngineHelp() {
    message('<h4>No LaTeX engine found</h4>Install one of these (the app finds it automatically):<ol>' +
      '<li><b>Tectonic</b> (recommended, small): run <code>powershell -ExecutionPolicy Bypass -File tools\\download_tectonic.ps1</code> in the app folder, then restart the app.</li>' +
      '<li>or install <b>MiKTeX</b> / <b>TeX Live</b>, so that <code>pdflatex</code> or <code>xelatex</code> works in a terminal.</li></ol>');
  }
  const zoomVal = () => $('#txZoom').value;
  function applyZoom() {
    const z = zoomVal();
    $$('.tx-page img', pagesBox).forEach(img => { img.style.width = z === 'fit' ? '100%' : Math.round(794 * (+z) / 100) + 'px'; img.style.maxWidth = z === 'fit' ? '100%' : 'none'; });
  }
  function showPages(pages) {
    const keep = pagesBox.scrollTop;
    pagesBox.innerHTML = '';
    pages.forEach((p, i) => {
      const f = el('div', 'tx-page'), img = new Image();
      img.src = p.url; img.alt = 'Page ' + (i + 1); img.draggable = false; img.style.aspectRatio = p.w + ' / ' + p.h;
      f.appendChild(img); f.appendChild(el('span', 'tx-pn', String(i + 1))); pagesBox.appendChild(f);
    });
    applyZoom(); pagesBox.scrollTop = keep;
  }
  function showProblems() {
    probBox.innerHTML = '';
    if (!errors.length) { probBox.appendChild(el('div', 'nav-empty', 'No problems.')); }
    errors.forEach(e => {
      const r = el('div', 'tx-prob', '<b>' + (e.line ? 'Line ' + e.line : 'Error') + '</b><span>' + esc(e.msg) + '</span>');
      r.addEventListener('click', () => gotoLine(e.line)); probBox.appendChild(r);
    });
    $('#txTabProb').textContent = 'Problems (' + errors.length + ')';
  }
  function showLogTab(t) {
    $('#txTabProb').classList.toggle('on', t === 'prob'); $('#txTabLog').classList.toggle('on', t === 'log');
    probBox.hidden = t !== 'prob'; logRaw.hidden = t !== 'log';
  }

  /* ---------- compile ---------- */
  function compile() {
    if (busy) { queued = true; return; }
    clearTimeout(autoT);
    if (!code.value.trim()) { setStatus('Write some LaTeX first'); return; }
    queued = false; errors = []; drawGutter(); showProblems(); logRaw.textContent = '';
    setBusy(true); showBusyMsg();
    tx({ op: 'compile', id: ++reqId, engine: $('#txEngine').value, source: code.value });
  }
  function onResult(res) {
    if (res.id !== reqId) return;
    setBusy(false);
    errors = Array.isArray(res.errors) ? res.errors : [];
    logRaw.textContent = res.log || '';
    drawGutter(); showProblems();
    if (res.noengine) { setStatus('No LaTeX engine found', 'err'); noEngineHelp(); }
    else if (res.cancelled) { setStatus('Stopped'); message('<b>Compile stopped.</b>'); }
    else if (res.ok) {
      showPages(res.pages);
      const w = res.warnings ? ' · ' + res.warnings + ' warning' + (res.warnings > 1 ? 's' : '') : '';
      setStatus((errors.length ? 'Compiled with ' + errors.length + ' error' + (errors.length > 1 ? 's' : '') : 'Compiled') + ' with ' + res.engine + ' in ' + res.seconds + ' s · ' + res.pages.length + ' page' + (res.pages.length > 1 ? 's' : '') + w, errors.length ? 'err' : 'ok');
    } else {
      setStatus(res.error || 'Compile failed', 'err');
      message('<h4>It did not compile</h4>' + esc(res.error || '') + '<br>Open <b>Problems</b> below: click an error to jump to its line. The <b>Log</b> tab has the full engine output.');
    }
    if (errors.length) { $('#txLogBox').classList.remove('collapsed'); showLogTab('prob'); }
    if (queued) { queued = false; setTimeout(compile, 50); }
  }
  window.onTexResult = function (res) {
    try {
      if (!res) return;
      if (res.op === 'result') onResult(res);
      else if (res.op === 'engines') { found = res.found || []; setWd(res.workdir); if (!found.length && studio) { setStatus('No LaTeX engine found', 'err'); noEngineHelp(); } }
      else if (res.op === 'opened') { code.value = res.source; fileName = res.name || fileName; setWd(res.workdir); errors = []; drawGutter(); persist(); compile(); }
      else if (res.op === 'workdir') setWd(res.path);
      else if (res.op === 'toast') showToast(res.msg, res.kind || 'success');
    } catch (e) { reportError('latex-studio', e); }
  };
  function setWd(p) { wdEl.textContent = p ? '📁 ' + p : ''; wdEl.title = p || ''; }

  /* ---------- buttons ---------- */
  function saveTex() { tx({ op: 'savetex', source: code.value, name: fileName }); }
  on($('#txToDoc'), 'click', () => {
    if (window.eqOpenLatexImport) window.eqOpenLatexImport(code.value, () => shell.classList.remove('tex-open'));
  });
  on($('#txCompile'), 'click', compile);
  on($('#txStop'), 'click', () => tx({ op: 'cancel' }));
  on($('#txOpen'), 'click', () => tx({ op: 'open' }));
  on($('#txFolder'), 'click', () => tx({ op: 'folder' }));
  on($('#txSave'), 'click', saveTex);
  on($('#txPdf'), 'click', () => tx({ op: 'savepdf' }));
  on($('#txZoom'), 'change', applyZoom);
  on($('#txAuto'), 'change', () => store.set('eqTexAuto', $('#txAuto').checked ? '1' : '0'));
  on($('#txEngine'), 'change', () => store.set('eqTexEngine', $('#txEngine').value));
  on($('#txBack'), 'click', () => shell.classList.remove('tex-open'));
  on($('#txTabProb'), 'click', () => showLogTab('prob'));
  on($('#txTabLog'), 'click', () => showLogTab('log'));
  on($('#txLogToggle'), 'click', () => $('#txLogBox').classList.toggle('collapsed'));

  function confirmReplace(name, ok) {
    const ov = el('div', 'eqmodal open'), card = el('div', 'eqmodal-card');
    card.innerHTML = '<h3>Replace your code?</h3><p class="help-text">The “' + esc(name) + '” template will replace what is in the editor now.</p>';
    const a = el('div', 'eqmodal-actions'), c = el('button', 'btn', 'Cancel'), o = el('button', 'btn btn-primary', 'Replace');
    c.type = o.type = 'button'; c.addEventListener('click', () => ov.remove()); o.addEventListener('click', () => { ov.remove(); ok(); });
    a.appendChild(c); a.appendChild(o); card.appendChild(a); ov.appendChild(card); document.body.appendChild(ov);
    ov.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') ov.remove(); });
  }
  function useTemplate(name, text) {
    const apply = () => { code.value = text; errors = []; fileName = 'document.tex'; drawGutter(); persist(); code.scrollTop = 0; compile(); };
    if (code.value.trim() && code.value.trim() !== SAMPLE.trim()) confirmReplace(name, apply); else apply();
  }
  bindPanel($('#txTpl'), simpleMenu([
    ['Article', 'amsmath', () => useTemplate('Article', TPL.article)],
    ['Thesis (report)', 'chapters, TOC', () => useTemplate('Thesis', TPL.thesis)],
    ['Math notes', 'theorems, proofs', () => useTemplate('Math notes', TPL.math)],
    ['Slides (Beamer)', '', () => useTemplate('Slides', TPL.slides)],
    ['Hello example', '', () => useTemplate('Hello example', SAMPLE)]
  ]));

  /* ---------- open / close ---------- */
  function openStudio() {
    shell.classList.add('tex-open');
    if (!loadedOnce) {
      loadedOnce = true;
      code.value = store.get('eqTex') || SAMPLE;
      $('#txAuto').checked = store.get('eqTexAuto') === '1';
      const eng = store.get('eqTexEngine'); if (eng && [...$('#txEngine').options].some(o => o.value === eng)) $('#txEngine').value = eng;
      const sp = parseFloat(store.get('eqTexSplit')); if (sp >= 20 && sp <= 75) studio.style.setProperty('--tx-split', sp + '%');
      drawGutter(); showLogTab('prob'); showProblems();
      setStatus('Press Compile (Ctrl+Enter)');
      message('<h4>LaTeX Studio</h4>Paste or type a complete LaTeX document on the left, then press <b>Compile</b> (<code>Ctrl+Enter</code>). The pages appear here.<br><br>Tip: pick a ready-made start from <b>Templates</b>.');
      tx({ op: 'engines' });
    }
    setTimeout(() => code.focus(), 60);
  }
  on($('#btnTex'), 'click', () => (shell.classList.contains('tex-open') ? shell.classList.remove('tex-open') : openStudio()));

  /* ---------- draggable divider ---------- */
  let drag = false;
  $('#txSplit').addEventListener('mousedown', e => { drag = true; e.preventDefault(); document.body.style.cursor = 'col-resize'; });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const r = $('.tx-main', studio).getBoundingClientRect();
    studio.style.setProperty('--tx-split', Math.max(20, Math.min(75, (e.clientX - r.left) / r.width * 100)).toFixed(1) + '%');
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    drag = false; document.body.style.cursor = '';
    store.set('eqTexSplit', String(parseFloat(getComputedStyle(studio).getPropertyValue('--tx-split')) || 46));
  });
})();
