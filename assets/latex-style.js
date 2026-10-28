/* 📁 FILE: assets/latex-style.js
   Makes an imported LaTeX document LOOK like the compiled one: it reads the preamble (fonts, colors, titlesec,
   hyperref, geometry, setspace, enumitem…) and applies it. Wraps window.eqLatexToHtml (from latex-import.js).
   Uses globals from app.js: $, $$, on, store, root, showToast, schedulePaginate, setPageSize. */
'use strict';
(function () {
  const T = window.eqLxTables, baseConv = window.eqLatexToHtml;
  if (!T || typeof baseConv !== 'function') return;
  const ROMAN = '"Latin Modern Roman","CMU Serif",Cambria,"Times New Roman",serif';
  const SANS = 'Arial,Helvetica,sans-serif';
  const readJson = (k, d) => { try { const v = JSON.parse(store.get(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };
  const px = p => Math.round(p * 4 / 3 * 10) / 10;

  /* ---------------- small readers ---------------- */
  const skip = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  function matchBrace(s, i) {
    let d = 0;
    for (let k = i; k < s.length; k++) { const c = s[k]; if (c === '\\') { k++; continue; } if (c === '{') d++; else if (c === '}') { d--; if (!d) return k; } }
    return -1;
  }
  function arg(s, i) {
    i = skip(s, i);
    if (s[i] === '{') { const e = matchBrace(s, i); return e < 0 ? { t: s.slice(i + 1), n: s.length } : { t: s.slice(i + 1, e), n: e + 1 }; }
    return { t: s[i] || '', n: i + 1 };
  }
  function opt(s, i) {
    const k = skip(s, i);
    if (s[k] === '[') { const e = s.indexOf(']', k); if (e > 0) return { t: s.slice(k + 1, e), n: e + 1 }; }
    return { t: null, n: i };
  }
  const stripC = src => src.replace(/\\begin\{comment\}[\s\S]*?\\end\{comment\}/g, '').split('\n').map(l => {
    for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i); }
    return l;
  }).join('\n');
  function parseOpts(str) {
    const o = {};
    String(str || '').split(',').forEach(p => { const i = p.indexOf('='); const k = (i < 0 ? p : p.slice(0, i)).trim(); if (k) o[k] = i < 0 ? true : p.slice(i + 1).trim().replace(/^\{|\}$/g, ''); });
    return o;
  }
  const truthy = v => v === true || v === 'true';
  function pt(str, base) {
    if (str == null) return null;
    const m = /^\s*(-?[\d.]+)\s*(pt|bp|px|mm|cm|in|em|ex|pc)?\s*$/i.exec(String(str));
    if (!m) return null;
    const f = { pt: 1, bp: 1.00375, px: 0.75, mm: 2.845, cm: 28.45, in: 72.27, pc: 12, em: base || 10, ex: (base || 10) * 0.45 }[(m[2] || 'pt').toLowerCase()];
    return parseFloat(m[1]) * f;
  }

  /* ---------------- colors ---------------- */
  const BASE = {
    red: '#ff0000', green: '#00ff00', blue: '#0000ff', cyan: '#00ffff', magenta: '#ff00ff', yellow: '#ffff00', black: '#000000', white: '#ffffff',
    gray: '#808080', darkgray: '#404040', lightgray: '#bfbfbf', brown: '#bf8040', lime: '#bfff00', olive: '#808000', orange: '#ff8000', pink: '#ffbfbf', purple: '#bf0040', teal: '#008080', violet: '#800080',
    NavyBlue: '#006eb8', RoyalBlue: '#0071bc', MidnightBlue: '#006795', CornflowerBlue: '#41b0e4', Cerulean: '#00a2e3', ProcessBlue: '#00b0f0', SkyBlue: '#46c5dd',
    ForestGreen: '#009b55', OliveGreen: '#3c8031', PineGreen: '#008b72', Maroon: '#af3235', BrickRed: '#b6321c', Mahogany: '#a9341f', Plum: '#92268f',
    Red: '#ed1b23', Blue: '#2d2f92', Green: '#00a99d', Orange: '#f58137', Gray: '#949698', Purple: '#8c2d85', Cyan: '#00aeef', Magenta: '#ec008c'
  };
  const hx = n => ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
  const rgbHex = (r, g, b) => '#' + hx(r) + hx(g) + hx(b);
  const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return null; const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  function mixHex(a, b, p) { const A = hexRgb(a), B = hexRgb(b); return (A && B) ? rgbHex(A[0] * p + B[0] * (1 - p), A[1] * p + B[1] * (1 - p), A[2] * p + B[2] * (1 - p)) : a; }
  function modelHex(model, spec, colors) {
    const v = String(spec).split(',').map(x => parseFloat(x));
    let h = null;
    if (model === 'RGB' && v.length >= 3) h = rgbHex(v[0], v[1], v[2]);
    else if (model === 'rgb' && v.length >= 3) h = rgbHex(v[0] * 255, v[1] * 255, v[2] * 255);
    else if (model === 'HTML') h = '#' + String(spec).trim().toLowerCase();
    else if (model === 'gray' && v.length >= 1) h = rgbHex(v[0] * 255, v[0] * 255, v[0] * 255);
    else if (model === 'cmyk' && v.length >= 4) h = rgbHex(255 * (1 - v[0]) * (1 - v[3]), 255 * (1 - v[1]) * (1 - v[3]), 255 * (1 - v[2]) * (1 - v[3]));
    else if (model === 'named') h = (colors && colors[String(spec).trim()]) || BASE[String(spec).trim()] || null;
    return (h && /^#[0-9a-f]{6}$/i.test(h)) ? h : null;
  }
  function colorExpr(expr, colors) {
    expr = String(expr).trim();
    if (/^#[0-9a-f]{6}$/i.test(expr)) return expr.toLowerCase();
    const parts = expr.replace(/^-/, '').split('!');
    const get = n => (colors && colors[n]) || BASE[n] || BASE[n.toLowerCase()] || null;
    let cur = get(parts[0]);
    if (!cur) return null;
    for (let i = 1; i < parts.length; i += 2) {
      const p = parseFloat(parts[i]);
      if (!(p >= 0 && p <= 100)) return cur;
      cur = mixHex(cur, (parts[i + 1] ? get(parts[i + 1]) : '#ffffff') || '#ffffff', p / 100);
    }
    return cur;
  }
  function parseColors(s) {
    const colors = {};
    let m, re = /\\definecolor\s*\{([^}]+)\}\s*\{(\w+)\}\s*\{([^}]*)\}/g;
    while ((m = re.exec(s))) { const h = modelHex(m[2], m[3], colors); if (h) colors[m[1].trim()] = h; }
    re = /\\colorlet\s*\{([^}]+)\}\s*\{([^}]+)\}/g;
    while ((m = re.exec(s))) { const h = colorExpr(m[2], colors); if (h) colors[m[1].trim()] = h; }
    return colors;
  }

  /* ---------------- sizes and fonts ---------------- */
  const SZ = {
    10: { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 },
    11: { tiny: 6, scriptsize: 8, footnotesize: 9, small: 10, normalsize: 10.95, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 },
    12: { tiny: 6, scriptsize: 8, footnotesize: 10, small: 10.95, normalsize: 12, large: 14.4, Large: 17.28, LARGE: 20.74, huge: 24.88, Huge: 24.88 }
  };
  const FONT_PKG = [
    [/^(tgpagella|mathpazo|palatino|pxfonts|newpxtext|palatcm)$/, '"Palatino Linotype","Book Antiqua",Palatino,serif'],
    [/^(times|mathptmx|newtxtext|tgtermes|txfonts|newtx)$/, '"Times New Roman",Times,serif'],
    [/^(helvet|arial|tgheros|lato|roboto|opensans|inter|carlito|sourcesanspro|fira)$/, SANS],
    [/^(charter|xcharter|utopia|fourier|bookman|tgbonum|newcent|tgschola|libertine|libertinus|kpfonts|crimson|garamondx|ebgaramond|cochineal)$/, 'Georgia,"Times New Roman",serif'],
    [/^(courier|tgcursor|inconsolata|beramono)$/, 'Consolas,"Courier New",monospace']
  ];
  function fontOf(s, pkgs) {
    const sm = /\\setmainfont\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/.exec(s);
    if (sm && /^[\w .-]{2,40}$/.test(sm[1].trim())) return '"' + sm[1].trim() + '",' + ROMAN;
    for (const p of pkgs) for (const [re, ff] of FONT_PKG) if (re.test(p)) return ff;
    if (/\\familydefault\s*\}?\s*\{?\s*\\sfdefault/.test(s)) return SANS;
    return ROMAN;
  }

  /* ---------------- titlesec ---------------- */
  function fmtSpec(fmt, st) {
    const sp = { fmt: true };
    const z = /\\(Huge|huge|LARGE|Large|large|normalsize|small|footnotesize|scriptsize|tiny)(?![A-Za-z])/.exec(fmt);
    if (z) sp.size = SZ[st.base][z[1]];
    sp.bold = /\\bfseries|\\bf(?![A-Za-z])|\\textbf/.test(fmt);
    sp.italic = /\\itshape|\\it(?![A-Za-z])|\\slshape|\\emph/.test(fmt);
    sp.sc = /\\scshape|\\textsc/.test(fmt);
    sp.upper = /\\MakeUppercase|\\uppercase/.test(fmt);
    sp.sans = /\\sffamily|\\sf(?![A-Za-z])/.test(fmt);
    sp.center = /\\centering/.test(fmt);
    const c = /\\color\s*(?:\[(\w+)\])?\s*\{([^}]+)\}/.exec(fmt);
    if (c) sp.color = c[1] ? modelHex(c[1], c[2], st.colors) : colorExpr(c[2], st.colors);
    return sp;
  }
  function parseTitlesec(s, st) {
    const heads = {};
    const LV = { chapter: 1, section: st.hasChapter ? 2 : 1, subsection: st.hasChapter ? 3 : 2, subsubsection: 3 };
    const get = name => { const lv = LV[name]; return (lv && !(st.hasChapter && name === 'subsubsection' && heads[3])) ? (heads[lv] = heads[lv] || {}) : null; };
    let m, re = /\\titleformat(\*?)\s*\{\s*\\(chapter|section|subsection|subsubsection)\s*\}/g;
    while ((m = re.exec(s))) {
      const star = !!m[1], head = get(m[2]);
      if (!head) continue;
      let j = re.lastIndex;
      const sh = opt(s, j); if (sh.t !== null) j = sh.n;
      const a1 = arg(s, j); j = a1.n;
      const sp = fmtSpec(a1.t, st);
      if (!star) {
        const a2 = arg(s, j); j = a2.n;
        const a3 = arg(s, j); j = a3.n;
        const a4 = arg(s, j); j = a4.n;
        sp.unnumbered = !a2.t.trim();
        const o2 = opt(s, j);
        if (o2.t !== null && /\\titlerule|\\hrule|\\rule/.test(o2.t)) {
          const c = /\\color\s*\{([^}]+)\}/.exec(o2.t), th = /\\titlerule\s*\[([^\]]*)\]/.exec(o2.t);
          sp.rule = { color: (c && colorExpr(c[1], st.colors)) || '#000000', w: Math.max(1, Math.round((th ? (pt(th[1], st.base) || 0.4) : 0.4) * 1.333)) };
        }
      }
      Object.assign(head, sp);
    }
    re = /\\titlespacing\*?\s*\{\s*\\(chapter|section|subsection|subsubsection)\s*\}\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}/g;
    while ((m = re.exec(s))) {
      const head = get(m[1]);
      if (!head) continue;
      const b = pt(m[3], st.base), a = pt(m[4], st.base);
      if (b != null) head.before = b;
      if (a != null) head.after = a;
    }
    return heads;
  }

  /* ---------------- everything in the preamble ---------------- */
  function parseLists(s, st) {
    const L = {}, opts = [];
    let m, re = /\\setlist\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
    while ((m = re.exec(s))) opts.push(parseOpts(m[1]));
    re = /\\begin\{(?:itemize|enumerate)\}\s*\[([^\]]*)\]/g;
    while ((m = re.exec(s))) opts.push(parseOpts(m[1]));
    opts.forEach(o => {
      if (truthy(o.nosep) || truthy(o.noitemsep)) { if (L.itemsep == null) L.itemsep = 0; if (truthy(o.nosep) && L.topsep == null) L.topsep = 0; }
      const is = pt(o.itemsep, st.base); if (is != null && L.itemsep == null) L.itemsep = is;
      const ts = pt(o.topsep, st.base); if (ts != null && L.topsep == null) L.topsep = ts;
    });
    return L;
  }
  function analyse(raw) {
    const s = stripC(raw);
    const di = s.indexOf('\\begin{document}');
    const body = di >= 0 ? s.slice(di + 16) : s;
    const st = { base: 10, colors: {}, heads: {}, links: { color: false, url: null }, lists: {}, unnumbered: false, hasChapter: false };
    const cm = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/.exec(s);
    const copts = (cm && cm[1]) || '', cls = cm ? cm[2].trim() : 'article';
    const bs = /(\d+)\s*pt/.exec(copts);
    if (bs && [10, 11, 12].includes(+bs[1])) st.base = +bs[1];
    st.hasChapter = /^(report|book|memoir|scrreprt|scrbook)$/.test(cls);
    st.colors = parseColors(s);

    const pkgs = [], opts = {};
    let m, re = /\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;
    while ((m = re.exec(s))) m[2].split(',').forEach(n => { n = n.trim(); pkgs.push(n); opts[n] = Object.assign(opts[n] || {}, parseOpts(m[1])); });

    /* page size and margins */
    const g = {};
    Object.assign(g, opts.geometry || {});
    re = /\\geometry\s*\{([^}]*)\}/g;
    while ((m = re.exec(s))) Object.assign(g, parseOpts(m[1]));
    const inch = v => { const p = pt(v, st.base); return p == null ? null : p / 72.27; };
    const a4 = /a4paper/.test(copts) || truthy(g.a4paper) || g.paper === 'a4paper';
    const tw = { 10: 345, 11: 360, 12: 390 }[st.base] / 72.27, pageW = a4 ? 8.27 : 8.5, dm = (pageW - tw) / 2;
    let l = inch(g.left != null ? g.left : g.lmargin != null ? g.lmargin : g.inner != null ? g.inner : g.margin);
    let r = inch(g.right != null ? g.right : g.rmargin != null ? g.rmargin : g.outer != null ? g.outer : g.margin);
    if (l == null) l = dm; if (r == null) r = dm;

    /* spacing */
    let lh = 1.2;
    const sso = opts.setspace || {};
    if (/\\onehalfspacing/.test(s) || truthy(sso.onehalfspacing)) lh = 1.5;
    if (/\\doublespacing/.test(s) || truthy(sso.doublespacing)) lh = 2.0;
    const sx = /\\(?:setstretch|linespread)\s*\{([\d.]+)\}/.exec(s);
    if (sx) lh = Math.max(0.9, Math.min(3, 1.2 * parseFloat(sx[1])));
    let pi = 1.5 * st.base, ps = 0;
    if (pkgs.includes('parskip')) { pi = 0; ps = Math.round(0.6 * st.base * 1.2 * 10) / 10; }
    const sp1 = /\\setlength\s*\{\\parindent\}\s*\{([^}]*)\}/.exec(s); if (sp1) { const v = pt(sp1[1], st.base); if (v != null) pi = v; }
    const sp2 = /\\setlength\s*\{\\parskip\}\s*\{([^}]*)\}/.exec(s); if (sp2) { const v = pt(sp2[1], st.base); if (v != null) ps = v; }

    /* links */
    const hy = Object.assign({}, opts.hyperref || {});
    re = /\\hypersetup\s*\{([\s\S]*?)\}/g;
    while ((m = re.exec(s))) Object.assign(hy, parseOpts(m[1].replace(/\s+/g, ' ')));
    if (truthy(hy.colorlinks) && !truthy(hy.hidelinks)) {
      st.links.color = true;
      const uc = hy.urlcolor != null ? hy.urlcolor : hy.allcolors;
      st.links.url = (uc && colorExpr(uc, st.colors)) || '#ff00ff';
    }

    st.heads = parseTitlesec(s, st);
    st.lists = parseLists(s, st);
    const sd = /\\setcounter\s*\{secnumdepth\}\s*\{(-?\d+)\}/.exec(s);
    st.unnumbered = !!(sd && +sd[1] <= 0);

    const sz = SZ[st.base];
    st.doc = {
      on: true, ff: fontOf(s, pkgs), fs: st.base === 11 ? 10.95 : st.base, lh, pi: Math.round(pi * 10) / 10, ps,
      h: st.hasChapter ? [sz.huge, sz.Large, sz.large] : [sz.Large, sz.large, sz.normalsize],
      margins: { l, r }, paper: a4 ? 'A4' : 'Letter',
      numPos: /\\pagestyle\s*\{empty\}/.test(s) ? 'none' : 'bc',
      first: /\\begin\{titlepage\}/.test(body) || (st.hasChapter && /\\maketitle/.test(body)),
      unnumbered: st.unnumbered
    };
    return st;
  }

  /* ---------------- tables used by the base converter ---------------- */
  function prepare(st, raw) {
    const sz = SZ[st.base];
    Object.keys(sz).forEach(k => { T.DECL[k] = 'font-size:' + sz[k] + 'pt'; });
    T.DECL.scshape = T.DECL.sc = 'font-variant:small-caps';
    T.DECL.mdseries = 'font-weight:400';
    T.DECL.upshape = T.DECL.normalfont = 'font-style:normal';
    T.WRAP.textsc = ['<span style="font-variant:small-caps">', '</span>'];
    Object.assign(T.COLORS, BASE, st.colors);
    const re = /\\(?:text)?color\s*\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(raw))) { const h = colorExpr(m[1], st.colors); if (h) T.COLORS[m[1].trim()] = h; }
  }
  function preprocess(raw, st) {
    return raw
      .replace(/\\(text)?color\s*\[(\w+)\]\s*\{([^}]*)\}/g, (m, t, model, spec) => { const h = modelHex(model, spec, st.colors); if (!h) return m; T.COLORS[h] = h; return '\\' + (t || '') + 'color{' + h + '}'; })
      .replace(/\\hfill(?![A-Za-z])/g, '\u0007')
      .replace(/\\hspace\*?\s*\{\\fill\}/g, '\u0007');
  }

  /* ---------------- decorating the converted HTML ---------------- */
  function hfill(el) {
    const lines = el.innerHTML.split(/<br\s*\/?>/i);
    let out = '';
    lines.forEach((ln, i) => {
      if (ln.indexOf('\u0007') >= 0) out += '<span class="eq-hfl">' + ln.split('\u0007').map(x => '<span>' + x.trim() + '</span>').join('') + '</span>';
      else { out += ln; if (i < lines.length - 1) out += '<br>'; }
    });
    el.innerHTML = out;
  }
  function decorate(html, st, res) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const rootN = tpl.content;
    rootN.querySelectorAll('p,li,td,th,h1,h2,h3').forEach(el => { if (el.innerHTML.indexOf('\u0007') >= 0) hfill(el); });
    let anyNumbered = false;
    rootN.querySelectorAll('h1,h2,h3').forEach(h => {
      const lv = +h.tagName[1], sp = st.heads[lv] || null;
      if (st.unnumbered || (sp && sp.unnumbered)) h.classList.add('eq-unnum');
      if (!h.classList.contains('eq-unnum')) anyNumbered = true;
      const css = [];
      if (h.classList.contains('eq-unnum') || sp) css.push('text-align:' + (sp && sp.center ? 'center' : 'left'));
      if (sp) {
        if (sp.fmt) {
          if (sp.size) css.push('font-size:' + (Math.round(sp.size * 100) / 100) + 'pt');
          css.push('font-weight:' + (sp.bold ? 700 : 400), 'font-style:' + (sp.italic ? 'italic' : 'normal'));
          if (sp.sc) css.push('font-variant:small-caps');
          if (sp.upper) css.push('text-transform:uppercase');
          if (sp.color) css.push('color:' + sp.color);
          if (sp.sans) css.push('font-family:' + SANS);
          if (sp.rule) css.push('border-bottom:' + sp.rule.w + 'px solid ' + sp.rule.color, 'padding-bottom:2px');
        }
        if (sp.before != null) css.push('margin-top:' + px(sp.before) + 'px');
        if (sp.after != null) css.push('margin-bottom:' + px(sp.after) + 'px');
      }
      if (css.length) h.setAttribute('style', css.join(';'));
    });
    if (res.report) res.report.numbered = anyNumbered && !st.unnumbered;
    rootN.querySelectorAll('a').forEach(a => {
      a.setAttribute('style', st.links.color ? 'color:' + st.links.url + ';text-decoration:none' : 'color:inherit;text-decoration:none');
    });
    const L = st.lists;
    if (L.itemsep != null || L.topsep != null) {
      rootN.querySelectorAll('ul,ol').forEach(l => {
        if (L.topsep != null) l.setAttribute('style', 'margin-top:' + px(L.topsep) + 'px;margin-bottom:' + px(L.topsep) + 'px');
        if (L.itemsep != null) [...l.children].forEach(li => { if (li.tagName === 'LI') li.setAttribute('style', 'margin-bottom:' + px(L.itemsep) + 'px'); });
      });
    }
    return tpl.innerHTML;
  }

  /* ---------------- the wrapper ---------------- */
  window.eqLatexToHtml = function (src0) {
    let src = String(src0 || '').replace(/\r\n?/g, '\n'), st = null;
    try { st = analyse(src); prepare(st, src); src = preprocess(src, st); } catch (e) { console.log('JS ERROR [latex-style]: ' + e.message); st = null; }
    const res = baseConv(src);
    if (!res || res.error || !st) return res;
    try { res.html = decorate(res.html, st, res); res.style = st.doc; } catch (e) { console.log('JS ERROR [latex-style]: ' + e.message); }
    return res;
  };

  /* ---------------- the LaTeX look (document-wide) ---------------- */
  const DEFAULT_LX = () => ({ on: true, ff: ROMAN, fs: 12, lh: 1.2, pi: 18, ps: 0, h1: 17.28, h2: 14.4, h3: 12 });
  function applyLx() {
    const o = readJson('eqLx', null), on_ = !!(o && o.on);
    root.classList.toggle('lx', on_);
    const S = root.style;
    if (on_) {
      const num = (v, a, b, d) => (typeof v === 'number' && v >= a && v <= b) ? v : d;
      S.setProperty('--lx-ff', /^[\w\s,"'.-]{3,200}$/.test(o.ff || '') ? o.ff : ROMAN);
      S.setProperty('--lx-fs', num(o.fs, 6, 30, 12) + 'pt');
      S.setProperty('--lx-lh', String(num(o.lh, 0.9, 3, 1.2)));
      S.setProperty('--lx-pi', num(o.pi, 0, 72, 18) + 'pt');
      S.setProperty('--lx-ps', num(o.ps, 0, 40, 0) + 'pt');
      S.setProperty('--lx-h1', num(o.h1, 8, 40, 17.28) + 'pt');
      S.setProperty('--lx-h2', num(o.h2, 8, 40, 14.4) + 'pt');
      S.setProperty('--lx-h3', num(o.h3, 8, 40, 12) + 'pt');
    }
    if (typeof schedulePaginate === 'function') schedulePaginate();
  }
  function syncLook() { $$('[data-look]').forEach(b => b.classList.toggle('active', (b.dataset.look === 'lx') === root.classList.contains('lx'))); }
  $$('[data-look]').forEach(b => on(b, 'click', () => {
    const want = b.dataset.look === 'lx';
    let o = readJson('eqLx', null);
    if (want && (!o || !o.ff)) o = DEFAULT_LX();
    o = Object.assign({}, o || DEFAULT_LX(), { on: want });
    store.set('eqLx', JSON.stringify(o)); applyLx(); syncLook();
    showToast(want ? 'LaTeX look is on' : 'Default look is on');
  }));

  window.eqLxAfterCommit = function (res, mode, look) {
    if (mode !== 'replace' || !look || !res || !res.style) return;
    const d = res.style;
    store.set('eqLx', JSON.stringify({ on: true, ff: d.ff, fs: d.fs, lh: d.lh, pi: d.pi, ps: d.ps, h1: d.h[0], h2: d.h[1], h3: d.h[2] }));
    applyLx(); syncLook();
    const cur = readJson('eqMargins', {});
    store.set('eqMargins', JSON.stringify({ l: Math.round(d.margins.l * 96), r: Math.round(d.margins.r * 96), lh: cur.lh || '1.5' }));
    if (window.eqApplyMargins) window.eqApplyMargins();
    if (typeof setPageSize === 'function') setPageSize(d.paper);
    if (window.eqSetHF) window.eqSetHF({ numPos: d.numPos, first: !!d.first });
    if (res.report && !res.report.numbered) {
      root.classList.remove('hnum'); store.set('hnum', '0');
      const b = $('#btnHnum'); if (b) b.classList.remove('on');
    }
  };

  applyLx(); syncLook();
})();
