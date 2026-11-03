/* 📁 FILE: assets/export.js
   Save As: Word, PDF, PNG, HTML, Markdown, LaTeX, text, OpenDocument, RTF, EPUB.
   PDF and PNG use the existing capture code; everything else sends clean HTML to Python, where Pandoc converts it.
   Equations travel as LaTeX (Pandoc turns them into real Word equations). */
'use strict';
(function () {
  const FORMATS = [
    ['docx', 'Word document (.docx)'],
    ['pdf', 'PDF document (.pdf)'],
    ['html', 'Web page (.html)'],
    ['md', 'Markdown (.md)'],
    ['tex', 'LaTeX (.tex)'],
    ['txt', 'Plain text (.txt)'],
    ['odt', 'OpenDocument text (.odt)'],
    ['rtf', 'Rich Text Format (.rtf)'],
    ['epub', 'E-book (.epub)'],
    ['png', 'Picture (.png)']
  ];
  const MAX_CHARS = 40000000;
  const known = k => FORMATS.some(f => f[0] === k);

  /* Clean copy of the document: equations become LaTeX text, charts become pictures, editor-only parts are removed */
  function buildHtml() {
    const liveMath = $$('math-field', doc), liveCanvas = $$('canvas', doc);
    const clone = doc.cloneNode(true);

    $$('math-field', clone).forEach((mf, i) => {
      let tex = '';
      try { tex = liveMath[i].getValue('latex'); } catch (e) { tex = ''; }
      tex = (tex || '').replace(/\\placeholder(\[[^\]]*\])?\{[^}]*\}/g, '').trim();
      if (!tex) { mf.remove(); return; }
      mf.textContent = '';
      const par = mf.parentElement;
      const alone = !!(par && par !== clone && par.tagName === 'P' &&
        par.querySelectorAll('math-field').length === 1 &&
        !(par.textContent || '').replace(/[\u200B\u00A0\s]/g, ''));
      const sp = document.createElement('span');
      sp.className = 'math ' + (alone ? 'display' : 'inline');
      sp.textContent = alone ? '\\[' + tex + '\\]' : '\\(' + tex + '\\)';
      mf.replaceWith(sp);
    });

    $$('canvas', clone).forEach((c, i) => {
      let url = '';
      try { url = liveCanvas[i].toDataURL('image/png'); } catch (e) { url = ''; }
      if (url.length > 100) {
        const im = document.createElement('img');
        im.src = url; im.alt = 'Chart';
        c.replaceWith(im);
      } else c.remove();
    });

    $$('.eq-pagebreak', clone).forEach(e => e.remove());
    $$('[contenteditable]', clone).forEach(e => e.removeAttribute('contenteditable'));

    const h = doc.querySelector('h1');
    const title = ((h && h.textContent) || '').replace(/[\u200B\s]+/g, ' ').trim().slice(0, 100) || 'Equation Studio document';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + eqEsc(title) + '</title></head><body>' +
      clone.innerHTML.replace(/\u200B/g, '') + '</body></html>';
    return { html, title };
  }

  function exportAs(fmt) {
    if (isEmpty()) return showToast('Nothing to save yet', 'warn');
    if (fmt === 'pdf') return requestExport('pdf');
    if (fmt === 'png') return takeScreenshot('save');
    let built;
    try { built = buildHtml(); } catch (e) { reportError('export', e); return showToast('Error: could not prepare the document', 'error'); }
    if (built.html.length > MAX_CHARS) return showToast('The document is too large to save in this format (over 40 MB)', 'warn');
    window.pyExportRequest = JSON.stringify({ fmt: fmt, title: built.title, html: built.html });
  }

  function openSaveAs() {
    let last = store.get('eqSaveFmt');
    if (!known(last)) last = 'docx';
    eqUI.form('Save As', [
      { id: 'fmt', label: 'File type', type: 'select', value: last, options: FORMATS }
    ], v => {
      const k = known(v.fmt) ? v.fmt : 'docx';
      store.set('eqSaveFmt', k);
      exportAs(k);
    }, { width: '380px', okText: 'Save' });
  }
  window.eqSaveAs = openSaveAs;

  /* Top bar button */
  const split = $('.topbar .btn-split');
  if (split) {
    const b = document.createElement('button');
    b.className = 'btn'; b.id = 'saveAsBtn'; b.type = 'button';
    b.title = 'Save As: Word, PDF, Markdown, LaTeX, HTML… (Ctrl+Shift+S)';
    b.innerHTML = icon('save', 15) + '<span class="txt">Save As…</span>';
    on(b, 'click', openSaveAs);
    split.parentNode.insertBefore(b, split);
  }

  /* Menu drawer item */
  const anchor = $('.d-item[data-act="png"]');
  if (anchor) {
    const d = document.createElement('button');
    d.className = 'd-item'; d.type = 'button';
    d.innerHTML = icon('save', 18) + 'Save As…<small>Ctrl+Shift+S</small>';
    on(d, 'click', () => { closeDrawer(); openSaveAs(); });
    anchor.parentNode.insertBefore(d, anchor);
  }

  /* Shortcut */
  on(document, 'keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); openSaveAs(); }
  });
})();