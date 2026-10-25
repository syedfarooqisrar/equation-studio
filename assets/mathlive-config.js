/* 📁 FILE: assets/mathlive-config.js
   Runs right after mathlive.min.js: bundled fonts, no sounds, and the on-screen keyboard is never shown
   (a touch screen would otherwise pop it up on every click). */
(function () {
  var MFE = window.MathfieldElement || (window.MathLive && window.MathLive.MathfieldElement);
  if (MFE) { MFE.fontsDirectory = "./fonts"; MFE.soundsDirectory = null; }

  var st = document.createElement('style');
  st.textContent = '.ML__keyboard,.MLK__backdrop,[class*="MLK__plate"]{display:none!important}';
  document.head.appendChild(st);

  var k0 = window.mathVirtualKeyboard;
  if (k0) { try { k0.container = null; } catch (e) { /* ignore */ } }

  function quiet() {
    var k = window.mathVirtualKeyboard;
    if (!k) return;
    try { if (k.visible) k.hide({ animate: false }); }
    catch (e) { try { k.visible = false; } catch (e2) { /* ignore */ } }
  }
  quiet();
  document.addEventListener('focusin', quiet, true);
  document.addEventListener('pointerup', function () { setTimeout(quiet, 0); }, true);
})();