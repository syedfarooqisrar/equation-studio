/* 📁 FILE: assets/ocr-tools.js
   Tools tab, OCR: read the text of a scanned PDF (searchable PDF or text file).
   This file only collects the options; Python (ocr_tools.py) opens the dialogs and runs Tesseract. */
'use strict';
(function () {
  const btn = $('#toolOcr');
  if (!btn) return;
  on(btn, 'click', () => {
    const langs = [['eng', 'English'], ['urd', 'Urdu'], ['eng+urd', 'English + Urdu']];
    let last = store.get('eqOcrLang');
    if (!langs.some(l => l[0] === last)) last = 'eng';
    eqUI.form('Read text from a scanned PDF', [
      { id: 'lang', label: 'Language in the PDF', type: 'select', value: last, options: langs,
        hint: 'Printed text works best. Handwriting and Nastaliq Urdu are often wrong.' },
      { id: 'out', label: 'Result', type: 'select', value: 'pdf',
        options: [['pdf', 'Searchable PDF (same look, text can be selected)'], ['txt', 'Text file (.txt)']] },
      { id: 'dpi', label: 'Scan quality', type: 'select', value: '300',
        options: [['200', '200 dpi (faster)'], ['300', '300 dpi (more accurate)']],
        hint: 'A page takes a few seconds.' }
    ], v => {
      store.set('eqOcrLang', v.lang);
      window.pyPdfRequest = JSON.stringify({ op: 'ocr', lang: v.lang, out: v.out, dpi: parseInt(v.dpi, 10) || 300 });
    }, { width: '440px', okText: 'Choose PDF…' });
  });
})();