/* 📁 FILE: assets/convert-tools.js
   Tools tab, Convert group: Word to PDF, PDF to Word, document to document, pictures to PDF, PDF to pictures.
   This file only collects the options; Python (convert_tools.py) opens the file dialogs and does the work. */
'use strict';
(function () {
  const send = o => { window.pyPdfRequest = JSON.stringify(o); };

  on($('#toolWord2Pdf'), 'click', () => send({ op: 'word2pdf' }));
  on($('#toolPdf2Word'), 'click', () => send({ op: 'pdf2word' }));
  on($('#toolImg2Pdf'), 'click', () => send({ op: 'img2pdf' }));

  on($('#toolDoc2Doc'), 'click', () => {
    let last = store.get('eqConvTarget');
    const opts = [['docx', 'Word (.docx)'], ['odt', 'OpenDocument (.odt)'], ['rtf', 'Rich Text (.rtf)'], ['html', 'Web page (.html)'],
      ['md', 'Markdown (.md)'], ['tex', 'LaTeX (.tex)'], ['txt', 'Plain text (.txt)'], ['epub', 'E-book (.epub)']];
    if (!opts.some(o => o[0] === last)) last = 'docx';
    eqUI.form('Convert document', [
      { id: 'target', label: 'Convert to', type: 'select', value: last, options: opts,
        hint: 'You can open .docx, .odt, .html, .md, .tex, .epub or .txt' }
    ], v => {
      store.set('eqConvTarget', v.target);
      send({ op: 'doc2doc', target: v.target });
    }, { width: '400px', okText: 'Choose file…' });
  });

  on($('#toolPdf2Img'), 'click', () => {
    eqUI.form('PDF to pictures', [
      { id: 'fmt', label: 'Picture type', type: 'select', value: 'png', options: [['png', 'PNG (sharp, bigger)'], ['jpg', 'JPG (smaller)']] },
      { id: 'dpi', label: 'Quality', type: 'select', value: '150',
        options: [['100', '100 dpi (small)'], ['150', '150 dpi (normal)'], ['200', '200 dpi (sharp)'], ['300', '300 dpi (print, large files)']] }
    ], v => {
      send({ op: 'pdf2img', fmt: v.fmt, dpi: parseInt(v.dpi, 10) || 150 });
    }, { width: '400px', okText: 'Choose PDF…' });
  });
})();