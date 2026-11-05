/* 📁 FILE: assets/data-studio.js
   Data Studio (editor side): overlay, ribbon buttons, and the bridge between the spreadsheet iframe and Python.
   iframe -> here (postMessage) -> Python (window.pyDataRequest, one request at a time)
   Python -> here (window.onDataResult) -> iframe */
'use strict';
(function () {
  const box = $('#dataStudio'), frame = $('#dsFrame'), status = $('#dsStatus');
  if (!box || !frame) return;
  const START_TIMEOUT_MS = 25000;
  let started = false, ready = false, timer = 0;
  const postQ = [], readyQ = [], pyQ = [];

  const setStatus = t => { status.textContent = t || ''; status.title = t || ''; };
  const send = m => { if (frame.contentWindow) frame.contentWindow.postMessage(m, '*'); };
  const post = m => { if (ready) send(m); else postQ.push(m); };

  /* Python reads one request every ~300 ms; this queue stops a second request from overwriting the first */
  function pump() {
    if (window.pyDataRequest) { setTimeout(pump, 150); return; }
    const next = pyQ.shift();
    if (!next) return;
    window.pyDataRequest = JSON.stringify(next);
    if (pyQ.length) setTimeout(pump, 150);
  }
  function toPython(o) {
    if (o.op === 'autosave') { for (let i = pyQ.length - 1; i >= 0; i--) if (pyQ[i].op === 'autosave') pyQ.splice(i, 1); }
    pyQ.push(o);
    pump();
  }

  function open() {
    box.classList.add('open');
    if (started) return;
    started = true;
    setStatus('Starting the spreadsheet…');
    timer = setTimeout(() => {
      if (!ready) { setStatus('The spreadsheet did not start'); showToast('The spreadsheet did not start. Details are in equation_studio.log', 'error'); }
    }, START_TIMEOUT_MS);
    frame.src = 'assets/data-studio.html';
  }
  const close = () => { post({ type: 'flush' }); box.classList.remove('open'); };
  const whenReady = fn => { open(); if (ready) fn(); else readyQ.push(fn); };
  const exportAs = kind => whenReady(() => post({ type: 'export', kind }));
  const openFile = () => whenReady(() => toPython({ op: 'open' }));

  window.addEventListener('message', e => {
    if (e.source !== frame.contentWindow || !e.data || typeof e.data.type !== 'string') return;
    const m = e.data;
    if (m.type === 'ready') {
      ready = true; clearTimeout(timer); setStatus('Ready');
      postQ.splice(0).forEach(send);
      toPython({ op: 'restore' });                       // bring back the last sheet, if there is one
      readyQ.splice(0).forEach(fn => fn());
    } else if (m.type === 'fatal') {
      clearTimeout(timer); setStatus('The spreadsheet could not start'); showToast(m.message, 'error');
    } else if (m.type === 'status') setStatus(m.text);
    else if (m.type === 'problem') showToast(m.message || 'Something went wrong', 'error');
    else if (m.type === 'autosave') toPython({ op: 'autosave', json: m.json });
    else if (m.type === 'exported') {
      if (!m.sheets || !m.sheets.length) return showToast('Nothing to save yet', 'warn');
      toPython({ op: 'save-' + m.kind, name: m.name, active: m.active, sheets: m.sheets });
    }
  });

  /* Python answers "open" and "restore" */
  window.onDataResult = res => {
    if (!res) return;
    if (res.ok === false) return showToast(res.error || 'Could not open the file', 'error');
    if (res.op === 'restore' && res.snapshot) post({ type: 'load-snapshot', snapshot: res.snapshot });
    else if (res.op === 'open') post({ type: 'load', res });
  };

  const bind = (id, fn) => { const b = document.getElementById(id); if (b) on(b, 'click', fn); };
  bind('toolDataStudio', open);
  bind('dtStudio', open);
  bind('dtOpen', openFile);
  bind('dtX', () => exportAs('xlsx'));
  bind('dtC', () => exportAs('csv'));
  bind('dtJ', () => exportAs('json'));
  bind('dsBack', close);
  bind('dsOpen', () => (ready ? toPython({ op: 'open' }) : showToast('The spreadsheet is still starting', 'warn')));
  bind('dsSaveX', () => (ready ? post({ type: 'export', kind: 'xlsx' }) : showToast('The spreadsheet is still starting', 'warn')));
  bind('dsSaveC', () => (ready ? post({ type: 'export', kind: 'csv' }) : showToast('The spreadsheet is still starting', 'warn')));
  bind('dsSaveJ', () => (ready ? post({ type: 'export', kind: 'json' }) : showToast('The spreadsheet is still starting', 'warn')));
  bind('dsNew', () => {
    if (!ready) return showToast('The spreadsheet is still starting', 'warn');
    if (window.confirm('Start a new empty sheet? Anything not saved will be lost.')) post({ type: 'new' });
  });
})();