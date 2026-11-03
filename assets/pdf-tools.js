/* 📁 FILE: assets/pdf-tools.js
   Tools tab: PDF merge, extract, split, rearrange, compress, compare.
   This file only collects the options; Python (pdf_tools.py) opens the file dialogs and does the work. */
'use strict';
(function () {
  const send = o => { window.pyPdfRequest = JSON.stringify(o); };
  const need = (v, msg) => {
    if (!v || !String(v).trim()) { showToast(msg, 'warn'); return false; }
    return true;
  };
  const OPTS = { width: '420px', okText: 'Choose PDF…' };

  on($('#toolMerge'), 'click', () => send({ op: 'merge' }));
  on($('#toolEach'), 'click', () => send({ op: 'each' }));
  on($('#toolCompare'), 'click', () => send({ op: 'compare' }));

  on($('#toolExtract'), 'click', () => {
    eqUI.form('Extract pages', [
      { id: 'pages', label: 'Pages to keep', value: '', placeholder: 'e.g. 1-3, 5, 8-10', hint: 'Page numbers start at 1' }
    ], v => {
      if (!need(v.pages, 'Type the pages first')) return false;
      send({ op: 'extract', pages: v.pages.trim() });
    }, OPTS);
  });

  on($('#toolArrange'), 'click', () => {
    eqUI.form('Rearrange pages', [
      { id: 'pages', label: 'New page order', value: '', placeholder: 'e.g. 3, 1, 2, 5-7', hint: 'Pages you leave out are removed. Write 5-1 to reverse.' },
      { id: 'rotate', label: 'Rotate the pages', type: 'select', value: '0',
        options: [['0', 'No rotation'], ['90', 'Rotate 90° right'], ['180', 'Rotate 180°'], ['270', 'Rotate 90° left']] }
    ], v => {
      if (!need(v.pages, 'Type the new page order first')) return false;
      send({ op: 'arrange', pages: v.pages.trim(), rotate: parseInt(v.rotate, 10) || 0 });
    }, OPTS);
  });

  on($('#toolCompress'), 'click', () => {
    eqUI.form('Compress PDF', [
      { id: 'level', label: 'Quality', type: 'select', value: 'balanced',
        options: [['high', 'High quality (small saving)'], ['balanced', 'Balanced (recommended)'], ['small', 'Smallest file (lower picture quality)']],
        hint: 'Scanned and photo PDFs shrink the most. Text-only PDFs shrink very little.' }
    ], v => {
      send({ op: 'compress', level: v.level });
    }, OPTS);
  });
})();