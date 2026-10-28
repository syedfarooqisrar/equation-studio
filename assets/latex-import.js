/* 📁 FILE: assets/latex-import.js
   Turns pasted LaTeX into the editor's own blocks (headings, equations, tables, lists, citations…), so it can be
   edited here like any other document. Pure JavaScript, offline, no engine needed.
   Entry points: window.eqLatexToHtml(src) and window.eqOpenLatexImport(prefill, onDone). */
'use strict';
(function () {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const uid = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4);
  const escT = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escA = s => escT(s).replace(/"/g, '&quot;');
  const PB = '<div class="eq-pagebreak" contenteditable="false" data-pb="1"></div>';
  const todayStr = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
  const readSources = () => { try { const a = JSON.parse(store.get('eqSources') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };

  /* ---------------------------------------------------------------- tables of knowledge */
  const WRAP = {
    textbf: ['<b>', '</b>'], textit: ['<i>', '</i>'], emph: ['<i>', '</i>'], textsl: ['<i>', '</i>'], underline: ['<u>', '</u>'], uline: ['<u>', '</u>'],
    texttt: ['<span style="font-family:Consolas,monospace">', '</span>'], textsf: ['<span style="font-family:Arial,sans-serif">', '</span>'],
    textrm: ['', ''], textnormal: ['', ''], textmd: ['', ''], textup: ['', ''], textsc: ['', ''], mbox: ['', ''], hbox: ['', ''], text: ['', ''],
    textsuperscript: ['<sup>', '</sup>'], textsubscript: ['<sub>', '</sub>'], MakeUppercase: ['', ''], MakeLowercase: ['', ''], textcolor_: ['', ''],
    textstyle: ['', ''], texorpdfstring: ['', ''], ensuremath: ['', ''], bibinfo: ['', ''], enquote: ['“', '”']
  };
  const DECL = {
    bfseries: 'font-weight:700', bf: 'font-weight:700', itshape: 'font-style:italic', it: 'font-style:italic', em: 'font-style:italic', slshape: 'font-style:italic', sl: 'font-style:italic',
    ttfamily: 'font-family:Consolas,monospace', tt: 'font-family:Consolas,monospace', sffamily: 'font-family:Arial,sans-serif', sf: 'font-family:Arial,sans-serif',
    tiny: 'font-size:6pt', scriptsize: 'font-size:7pt', footnotesize: 'font-size:8pt', small: 'font-size:10pt', normalsize: 'font-size:12pt',
    large: 'font-size:14pt', Large: 'font-size:17pt', LARGE: 'font-size:20pt', huge: 'font-size:25pt', Huge: 'font-size:30pt'
  };
  const SYM = { ldots: '…', dots: '…', cdots: '⋯', LaTeX: 'LaTeX', TeX: 'TeX', textbackslash: '\\', textasciitilde: '~', S: '§', P: '¶', copyright: '©', pounds: '£', euro: '€', ss: 'ß', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', textdegree: '°', degree: '°', textbullet: '•', dag: '†', ddag: '‡', textregistered: '®', texttrademark: '™', textendash: '–', textemdash: '—', textquoteleft: '‘', textquoteright: '’', textquotedblleft: '“', textquotedblright: '”', checkmark: '✓', ldotp: '.', textellipsis: '…', slash: '/', textunderscore: '_', textless: '<', textgreater: '>', textbar: '|', textasciicircum: '^', textpercent: '%', textdollar: '$', textampersand: '&', textbraceleft: '{', textbraceright: '}' };
  const ACC = {
    "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', c: 'ć', n: 'ń', s: 'ś', z: 'ź' },
    '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' },
    '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', y: 'ÿ', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' },
    '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', I: 'Î', O: 'Ô', U: 'Û' },
    '~': { a: 'ã', n: 'ñ', o: 'õ', A: 'Ã', N: 'Ñ', O: 'Õ' }
  };
  const COLORS = { red: '#c00000', blue: '#0000ff', green: '#00a000', black: '#000000', gray: '#808080', grey: '#808080', orange: '#ed7d31', purple: '#7030a0', brown: '#8b4513', cyan: '#00b0f0', magenta: '#ff00ff' };
  const IGNORE = {
    usepackage: 1, documentclass: 1, geometry: 1, hypersetup: 1, pagestyle: 1, thispagestyle: 1, setlength: 2, setcounter: 2, addtolength: 2, linespread: 1,
    bibliographystyle: 1, graphicspath: 1, numberwithin: 2, setstretch: 1, markboth: 2, markright: 1, pagecolor: 1, addcontentsline: 3, vspace: 1, hspace: 1,
    noindent: 0, hfill: 0, vfill: 0, bigskip: 0, medskip: 0, smallskip: 0, centering: 0, raggedright: 0, raggedleft: 0, indent: 0, linebreak: 0, nobreak: 0,
    pagebreak: 0, nopagebreak: 0, protect: 0, relax: 0, onehalfspacing: 0, doublespacing: 0, singlespacing: 0, frontmatter: 0, mainmatter: 0, backmatter: 0,
    hline: 0, toprule: 0, midrule: 0, bottomrule: 0, cline: 1, thanks: 1, index: 1, glossary: 1, allowdisplaybreaks: 0, sloppy: 0, fussy: 0, flushbottom: 0,
    raggedbottom: 0, hyphenation: 1, selectlanguage: 1, fontsize: 2, selectfont: 0, newblock: 0, appendix: 0, newline: 'br', theoremstyle: 1, floatplacement: 2,
    captionsetup: 1, renewcommand_: 0, nocite: 1, lstset: 1, usetikzlibrary: 1, urlstyle: 1, bibliographystyle_: 0, tableofcontents_: 0, maketitle_: 0,
    parindent: 0, parskip: 0, baselineskip: 0, textwidth: 0, linewidth: 0, columnwidth: 0
  };
  window.eqLxTables = { WRAP, DECL, COLORS, SYM };
  const CITES = new Set(['cite', 'citep', 'citet', 'citealp', 'citealt', 'citeauthor', 'citeyear', 'parencite', 'textcite', 'autocite', 'footcite', 'Cite', 'Parencite', 'Textcite']);
  const REFS = new Set(['ref', 'eqref', 'autoref', 'cref', 'Cref', 'vref', 'nameref', 'pageref']);
  const BLOCK_CMDS = new Set(['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'title', 'author', 'date', 'maketitle',
    'tableofcontents', 'listoffigures', 'listoftables', 'newpage', 'clearpage', 'cleardoublepage', 'pagebreak', 'pagenumbering', 'bibliography', 'printbibliography', 'appendix']);
  const THEO_MAP = { theorem: 'theorem', thm: 'theorem', lemma: 'lemma', lem: 'lemma', proposition: 'proposition', prop: 'proposition', corollary: 'corollary', cor: 'corollary', definition: 'definition', defn: 'definition', defi: 'definition', dfn: 'definition', remark: 'remark', rem: 'remark', example: 'example', ex: 'example', exa: 'example', proof: 'proof' };
  const NAME_TYPE = { theorem: 'theorem', lemma: 'lemma', proposition: 'proposition', corollary: 'corollary', definition: 'definition', remark: 'remark', example: 'example', claim: 'remark', conjecture: 'remark', fact: 'remark', observation: 'remark', note: 'remark', notation: 'definition', axiom: 'definition', assumption: 'definition', problem: 'example', exercise: 'example', question: 'example' };

  /* ---------------------------------------------------------------- readers */
  const skipWs = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  function matchBrace(s, i) {
    let d = 0;
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (c === '{') d++;
      else if (c === '}') { d--; if (!d) return k; }
    }
    return -1;
  }
  function readArg(s, j) {
    j = skipWs(s, j);
    if (s[j] === '{') { const e = matchBrace(s, j); if (e < 0) return { text: s.slice(j + 1), next: s.length }; return { text: s.slice(j + 1, e), next: e + 1 }; }
    if (s[j] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(j, j + 40)); return { text: m ? m[0] : '', next: j + (m ? m[0].length : 1) }; }
    return { text: s[j] || '', next: j + 1 };
  }
  function readOpt(s, j) {
    const k = skipWs(s, j);
    if (s[k] === '[') { const e = s.indexOf(']', k); if (e > 0) return { text: s.slice(k + 1, e), next: e + 1 }; }
    return { text: null, next: j };
  }
  function skipArgs(s, j, count) {
    j = readOpt(s, j).next;
    for (let k = 0; k < count; k++) j = readArg(s, j).next;
    return j;
  }
  function findEnd(s, name, from) {
    const b = '\\begin{' + name + '}', e = '\\end{' + name + '}';
    let depth = 1, i = from;
    while (i < s.length) {
      const nb = s.indexOf(b, i), ne = s.indexOf(e, i);
      if (ne < 0) return -1;
      if (nb >= 0 && nb < ne) { depth++; i = nb + b.length; }
      else { depth--; if (depth === 0) return ne; i = ne + e.length; }
    }
    return -1;
  }
  function findCmd(s, name) {
    const re = new RegExp('\\\\' + name + '(?![A-Za-z])\\*?');
    const m = re.exec(s);
    if (!m) return null;
    const o = readOpt(s, m.index + m[0].length);
    const k = skipWs(s, o.next);
    if (s[k] !== '{') return null;
    const e = matchBrace(s, k);
    if (e < 0) return null;
    return { text: s.slice(k + 1, e), start: m.index, end: e + 1, opt: o.text };
  }
  function splitTop(s, sep) {
    const parts = [];
    let cur = '', brace = 0, env = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') {
        if (sep === '\\\\' && s[i + 1] === '\\' && brace === 0 && env === 0) { parts.push(cur); cur = ''; i++; continue; }
        if (s.startsWith('\\begin{', i)) env++;
        else if (s.startsWith('\\end{', i)) env = Math.max(0, env - 1);
        cur += c + (s[i + 1] || ''); i++; continue;
      }
      if (c === '{') brace++; else if (c === '}') brace = Math.max(0, brace - 1);
      if (sep === '&' && c === '&' && brace === 0 && env === 0) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    parts.push(cur);
    return parts;
  }
  const closeDollar = (s, from) => { for (let k = from; k < s.length; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === '$') return k; } return -1; };

  /* ---------------------------------------------------------------- context */
  function newCtx() {
    return {
      macros: Object.create(null), theo: Object.create(null), labels: Object.create(null), meta: {}, hasChapter: false, align: null, pclass: null,
      verb: [], verbi: [], issues: [], unsupported: new Set(), pictures: [], mathBad: [], existing: readSources(), newSources: [], hasBibItems: false, last: null,
      rep: { headings: 0, equations: 0, math: 0, tables: 0, figures: 0, lists: 0, theorems: 0, citations: 0, footnotes: 0, numbered: false, missingCites: new Set(), missingRefs: new Set() }
    };
  }
  const withCtx = (ctx, a, p, fn) => { const sa = ctx.align, sp = ctx.pclass; ctx.align = a; ctx.pclass = p; try { return fn(); } finally { ctx.align = sa; ctx.pclass = sp; } };

  /* ---------------------------------------------------------------- math */
  function cleanMath(raw) {
    let m = String(raw)
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\\(?:nonumber|notag|qedhere|allowdisplaybreaks|displaybreak)\b(?:\[[^\]]*\])?/g, '')
      .replace(/\\tag\*?\{[^}]*\}/g, '')
      .replace(/\\begin\{split\}/g, '\\begin{aligned}').replace(/\\end\{split\}/g, '\\end{aligned}')
      .replace(/\\intertext\{([^}]*)\}/g, '\\text{$1}')
      .replace(/\\\\\s*\[[^\]]*\]/g, '\\\\')
      .replace(/\\operatorname\*/g, '\\operatorname')
      .replace(/\\mathscr\b/g, '\\mathcal').replace(/\\mathbbm\b/g, '\\mathbb')
      .replace(/\\bm\b/g, '\\boldsymbol')
      .replace(/\\(?:big|Big|bigg|Bigg)([lr]?)(?=[\s(\[{|.\\])/g, '')
      .replace(/\\hfill/g, '')
      .trim();
    return m.replace(/(\\\\\s*)+$/, '').trim();
  }
  function checkMath(m, ctx) {
    const ML = window.MathLive;
    if (!ML || typeof ML.validateLatex !== 'function' || ctx.mathBad.length >= 12) return;
    try { const e = ML.validateLatex(m); if (e && e.length) ctx.mathBad.push(m.slice(0, 60) + '  →  ' + (e[0].code || 'syntax')); } catch (err) { /* ignore */ }
  }
  function mathInline(raw, ctx) {
    const m = cleanMath(raw);
    if (!m) return '';
    ctx.rep.math++; checkMath(m, ctx);
    return '<math-field value="' + escA(m) + '"></math-field>';
  }
  function display(raw, numbered, ctx) {
    const id = uid();
    const body = raw.replace(/\\label\{([^}]*)\}/g, (m, l) => { ctx.labels[l.trim()] = { id, type: 'eq' }; return ''; });
    const m = cleanMath(body);
    if (!m) return '';
    ctx.rep.equations++; checkMath(m, ctx);
    const mf = '<math-field value="' + escA(m) + '"></math-field>';
    return numbered ? '<div class="eq-eqn" data-id="' + id + '">' + mf + '</div>' : '<p style="text-align:center">' + mf + '\u200B</p>';
  }
  function displayEnv(base, star, body, ctx) {
    let b = body;
    const numbered = !star && base !== 'displaymath' && base !== 'math';
    if (base === 'alignat') b = b.replace(/^\s*\{\d+\}/, '');
    if (base === 'eqnarray') b = b.replace(/&\s*=\s*&/g, '&=');
    if (['align', 'alignat', 'flalign', 'gather', 'multline', 'eqnarray'].includes(base)) b = '\\begin{aligned}' + b + '\\end{aligned}';
    return display(b, numbered, ctx);
  }

  /* ---------------------------------------------------------------- inline text */
  function link(url, html) {
    const u = url.trim();
    return /^(https?:\/\/|mailto:)[^\s"'<>]{1,500}$/i.test(u) ? '<a href="' + escA(u) + '">' + html + '</a>' : html;
  }
  function srcFor(key, ctx) {
    const lk = key.trim().toLowerCase();
    if (!lk) return null;
    const s = ctx.existing.find(x => (x.key || '').toLowerCase() === lk) || ctx.newSources.find(x => x.key.toLowerCase() === lk);
    return s ? s.id : null;
  }
  function citeHtml(keys, ctx) {
    const parts = [];
    keys.forEach(k => {
      const id = srcFor(k, ctx);
      ctx.rep.citations++;
      if (id) parts.push('<span class="eq-cite" data-src="' + id + '" contenteditable="false">[?]</span>');
      else { parts.push('[' + escT(k) + ']'); ctx.rep.missingCites.add(k); }
    });
    return parts.join(', ');
  }
  function command(name, s, j, ctx) {
    const R = (html, next) => ({ html, next });
    if (has(WRAP, name)) { const a = readArg(s, j); return R(WRAP[name][0] + inline(a.text, ctx) + WRAP[name][1], a.next); }
    if (has(SYM, name)) return R(SYM[name], j);
    if (has(DECL, name)) return R('<span style="' + DECL[name] + '">' + inline(s.slice(j), ctx) + '</span>', s.length);
    if (CITES.has(name)) {
      const o1 = readOpt(s, j), o2 = readOpt(s, o1.next), a = readArg(s, o2.next);
      return R(citeHtml(a.text.split(',').map(x => x.trim()).filter(Boolean), ctx), a.next);
    }
    if (REFS.has(name)) { const a = readArg(s, j); return R('\u0001' + name + ':' + a.text.trim() + '\u0002', a.next); }
    switch (name) {
      case 'textcolor': { const c = readArg(s, j), t = readArg(s, c.next), col = has(COLORS, c.text.trim()) ? COLORS[c.text.trim()] : '', h = inline(t.text, ctx); return R(col ? '<span style="color:' + col + '">' + h + '</span>' : h, t.next); }
      case 'color': { const c = readArg(s, j), col = has(COLORS, c.text.trim()) ? COLORS[c.text.trim()] : '', rest = inline(s.slice(c.next), ctx); return R(col ? '<span style="color:' + col + '">' + rest + '</span>' : rest, s.length); }
      case 'footnote': case 'footnotetext': {
        const o = readOpt(s, j), a = readArg(s, o.next);
        ctx.rep.footnotes++;
        return R('<span class="eq-fnref" contenteditable="false" data-note="' + escA(plain(inline(a.text, ctx)).slice(0, 1000)) + '">0</span>', a.next);
      }
      case 'label': { const a = readArg(s, j), l = a.text.trim(); if (ctx.last && l && !ctx.labels[l]) ctx.labels[l] = ctx.last; return R('', a.next); }
      case 'url': { const a = readArg(s, j); return R(link(a.text, escT(a.text)), a.next); }
      case 'href': { const u = readArg(s, j), t = readArg(s, u.next); return R(link(u.text, inline(t.text, ctx)), t.next); }
      case 'includegraphics': { const o = readOpt(s, j), a = readArg(s, o.next); ctx.pictures.push(a.text.trim()); return R('<span class="eq-imgph">[Picture: ' + escT(a.text.trim()) + ']</span>', a.next); }
      case 'today': return R(todayStr(), j);
      case 'par': return R('<br>', j);
      case 'begin': case 'end': { const a = readArg(s, j); return R('', a.next); }
      case 'item': return R('', j);
      case 'and': return R(', ', j);
      case 'input': case 'include': { const a = readArg(s, j); ctx.issues.push('\\' + name + '{' + a.text + '} was not included (paste that file too).'); return R('', a.next); }
      case 'newtheorem': { const k = skipArgs(s, j, 2); return R('', readOpt(s, k).next); }
      case 'newcommand': case 'renewcommand': case 'providecommand': {
        let k = skipWs(s, j);
        if (s[k] === '{') k = readArg(s, k).next; else k += (/^\\[A-Za-z]+/.exec(s.slice(k, k + 40)) || ['\\x'])[0].length;
        k = readOpt(s, k).next; k = readOpt(s, k).next;
        return R('', readArg(s, k).next);
      }
      case 'DeclareMathOperator': { const k = skipArgs(s, j, 2); return R('', k); }
      default: break;
    }
    if (has(IGNORE, name)) return R(IGNORE[name] === 'br' ? '<br>' : '', skipArgs(s, j, IGNORE[name] === 'br' ? 0 : IGNORE[name]));
    ctx.unsupported.add('\\' + name);
    const k = skipWs(s, j);
    if (s[k] === '{') { const a = readArg(s, j); return R(inline(a.text, ctx), a.next); }
    return R('', j);
  }
  function inline(s, ctx) {
    let out = '', i = 0;
    const n = s.length;
    while (i < n) {
      const c = s[i];
      if (c === '\u0003') { const e = s.indexOf('\u0004', i); if (e < 0) { i++; continue; } out += ctx.verbi[+s.slice(i + 1, e)] || ''; i = e + 1; continue; }
      if (c === '\\') {
        const nx = s[i + 1];
        if (nx === undefined) break;
        if (nx === '\\') {
          i += 2; if (s[i] === '*') i++;
          const o = readOpt(s, i);
          if (o.text !== null && /^\s*[-+]?[\d.]+\s*[a-z]{1,3}\s*$/i.test(o.text)) i = o.next;
          out += '<br>'; continue;
        }
        if (nx === '(') { const e = s.indexOf('\\)', i + 2); if (e > 0) { out += mathInline(s.slice(i + 2, e), ctx); i = e + 2; continue; } }
        if (/[A-Za-z]/.test(nx)) {
          let j = i + 1;
          while (j < n && /[A-Za-z]/.test(s[j])) j++;
          const name = s.slice(i + 1, j);
          if (s[j] === '*') j++;
          const r = command(name, s, j, ctx);
          out += r.html; i = r.next; continue;
        }
        i += 2;
        if (has(ACC, nx)) {
          let ch = s[i] || '', adv = 1;
          if (ch === '{') { const e = s.indexOf('}', i); if (e > 0) { ch = s.slice(i + 1, e); adv = e - i + 1; } }
          out += (has(ACC[nx], ch) ? ACC[nx][ch] : escT(ch)); i += adv; continue;
        }
        if (nx === '=' || nx === '.') { continue; }
        if (nx === '&' || nx === '%' || nx === '$' || nx === '#' || nx === '_' || nx === '{' || nx === '}') out += escT(nx);
        else if (nx === ',') out += '\u202F';
        else if (nx === ';' || nx === ':' || nx === ' ') out += '\u00A0';
        else if (nx === '!' || nx === '-' || nx === '@' || nx === '/') { /* nothing */ }
        else out += escT(nx);
        continue;
      }
      if (c === '$') {
        const e = closeDollar(s, i + 1);
        if (e < 0) { out += '$'; i++; continue; }
        out += mathInline(s.slice(i + 1, e), ctx); i = e + 1; continue;
      }
      if (c === '{') { const e = matchBrace(s, i); if (e < 0) { i++; continue; } out += inline(s.slice(i + 1, e), ctx); i = e + 1; continue; }
      if (c === '}') { i++; continue; }
      if (c === '~') { out += '\u00A0'; i++; continue; }
      if (c === '-') { if (s.startsWith('---', i)) { out += '—'; i += 3; } else if (s.startsWith('--', i)) { out += '–'; i += 2; } else { out += '-'; i++; } continue; }
      if (c === '`') { if (s[i + 1] === '`') { out += '“'; i += 2; } else { out += '‘'; i++; } continue; }
      if (c === "'") { if (s[i + 1] === "'") { out += '”'; i += 2; } else { out += '’'; i++; } continue; }
      if (/\s/.test(c)) { if (!out.endsWith(' ')) out += ' '; i++; continue; }
      if (c === '<') out += '&lt;'; else if (c === '>') out += '&gt;'; else if (c === '&') out += '&amp;'; else out += c;
      i++;
    }
    return out;
  }

  /* ---------------------------------------------------------------- blocks */
  function para(buf, ctx) {
    let t = buf.replace(/^\s+/, '');
    let align = ctx.align;
    if (/^\\centering\b/.test(t)) { align = 'center'; t = t.replace(/^\\centering\b/, ''); }
    else if (/^\\raggedleft\b/.test(t)) { align = 'right'; t = t.replace(/^\\raggedleft\b/, ''); }
    const h = inline(t, ctx).replace(/(<br>\s*)+$/, '').replace(/^(\s|<br>)+/, '').trim();
    if (!h.replace(/<(?!math-field)[^>]*>/g, '').replace(/&nbsp;/g, '').trim()) return '';
    const cls = ctx.pclass ? ' class="' + ctx.pclass + '"' : '';
    const st = align ? ' style="text-align:' + align + '"' : '';
    return '<p' + cls + st + '>' + h + '</p>';
  }
  function heading(lv, text, unnum, ctx) {
    const id = uid();
    ctx.last = { id, type: 'sec' };
    if (!unnum) ctx.rep.numbered = true;
    ctx.rep.headings++;
    const cls = (lv === 1 && unnum) ? ' class="eq-unnum"' : '';
    const h = inline(text, ctx).replace(/(<br>\s*)+/g, ' ').trim();
    return '<h' + lv + cls + ' data-id="' + id + '">' + h + '</h' + lv + '>';
  }
  function titleBlocks(ctx) {
    const m = ctx.meta, out = [];
    if (m.title) out.push('<p class="eq-title">' + inline(m.title, ctx) + '</p>');
    if (m.author) out.push('<p class="eq-subtitle"><b>' + inline(m.author, ctx) + '</b></p>');
    const d = m.date === undefined ? todayStr() : inline(m.date, ctx);
    if (d && d.trim()) out.push('<p class="eq-subtitle">' + d + '</p>');
    if (ctx.hasChapter) out.push(PB);
    return out;
  }
  const tocDiv = kind => '<div class="eq-toc" data-toc="' + kind + '" contenteditable="false"></div>';
  const bibBlocks = ctx => ['<h1 class="eq-unnum" data-id="' + uid() + '">' + (ctx.hasChapter ? 'Bibliography' : 'References') + '</h1>', '<div class="eq-bib" data-bib="1" contenteditable="false"></div>'];
  function pushBreak(out, sec) {
    const last = out[out.length - 1];
    if (last === PB) out.pop();
    else if (last && last.startsWith('<div class="eq-pagebreak"')) { if (!sec) return; out.pop(); }
    out.push(sec ? '<div class="eq-pagebreak" contenteditable="false" data-pb="1" data-sec="' + sec + '" data-start="1"></div>' : PB);
  }
  function blockCmd(name, star, s, pos, out, ctx) {
    const R = (next, prefix) => ({ next, prefix: prefix || '' });
    switch (name) {
      case 'part': case 'chapter': case 'section': case 'subsection': case 'subsubsection': {
        const o = readOpt(s, pos), a = readArg(s, o.next);
        const lv = (name === 'part' || name === 'chapter') ? 1 : name === 'section' ? (ctx.hasChapter ? 2 : 1) : name === 'subsection' ? (ctx.hasChapter ? 3 : 2) : 3;
        out.push(heading(lv, a.text, star || name === 'part', ctx));
        return R(a.next);
      }
      case 'paragraph': case 'subparagraph': { const o = readOpt(s, pos), a = readArg(s, o.next); return R(a.next, '\\textbf{' + a.text + '.} '); }
      case 'title': case 'author': case 'date': { const o = readOpt(s, pos), a = readArg(s, o.next); ctx.meta[name] = a.text; return R(a.next); }
      case 'maketitle': titleBlocks(ctx).forEach(b => out.push(b)); return R(pos);
      case 'tableofcontents': out.push(tocDiv('toc')); return R(pos);
      case 'listoffigures': out.push(tocDiv('figure')); return R(pos);
      case 'listoftables': out.push(tocDiv('table')); return R(pos);
      case 'newpage': case 'clearpage': case 'cleardoublepage': if (out.length) pushBreak(out, null); return R(pos);
      case 'pagebreak': return R(readOpt(s, pos).next, '');
      case 'pagenumbering': {
        const a = readArg(s, pos), f = { roman: 'lroman', Roman: 'uroman', arabic: 'arabic' }[a.text.trim()];
        if (f && out.length) pushBreak(out, f);
        else if (!out.length) ctx.issues.push('\\pagenumbering at the very start was ignored: set it in Insert → Header & Footer.');
        return R(a.next);
      }
      case 'bibliography': { const a = readArg(s, pos); bibBlocks(ctx).forEach(b => out.push(b)); if (!ctx.hasBibItems) ctx.issues.push('The bibliography file “' + a.text + '.bib” is not part of the pasted code. Import it in References → Manage Sources → Import .bib, then convert again so the citations link up.'); return R(a.next); }
      case 'printbibliography': { bibBlocks(ctx).forEach(b => out.push(b)); return R(readOpt(s, pos).next); }
      case 'appendix': ctx.issues.push('\\appendix is ignored: rename the appendix headings yourself.'); return R(pos);
      default: return R(pos);
    }
  }
  function parseBlocks(s, ctx) {
    const out = [];
    let buf = '', i = 0;
    const n = s.length;
    const flush = () => { const h = para(buf, ctx); if (h) out.push(h); buf = ''; };
    while (i < n) {
      const c = s[i];
      if (c === '\\') {
        if (s.startsWith('\\begin{', i)) {
          const ne = s.indexOf('}', i + 7);
          if (ne > 0) {
            const name = s.slice(i + 7, ne), end = findEnd(s, name, ne + 1);
            if (end > 0) {
              flush();
              try { envBlocks(name, s.slice(ne + 1, end), ctx).forEach(b => { if (b) out.push(b); }); }
              catch (e) { ctx.issues.push('Could not convert the “' + name + '” part (' + ((e && e.message) || e) + ').'); }
              i = end + ('\\end{' + name + '}').length; continue;
            }
            ctx.issues.push('\\begin{' + name + '} has no matching \\end.');
            i = ne + 1; continue;
          }
        }
        const nx = s[i + 1];
        if (nx === '[') { const e = s.indexOf('\\]', i + 2); if (e > 0) { flush(); const h = display(s.slice(i + 2, e), false, ctx); if (h) out.push(h); i = e + 2; continue; } }
        if (nx === '(') { const e = s.indexOf('\\)', i + 2); if (e > 0) { buf += s.slice(i, e + 2); i = e + 2; continue; } }
        const m = /^\\([A-Za-z]+)(\*?)/.exec(s.slice(i, i + 40));
        if (m) {
          const name = m[1];
          if (name === 'par') { flush(); i += m[0].length; continue; }
          if (BLOCK_CMDS.has(name)) {
            flush();
            const r = blockCmd(name, !!m[2], s, i + m[0].length, out, ctx);
            i = r.next; if (r.prefix) buf = r.prefix;
            continue;
          }
          buf += m[0]; i += m[0].length; continue;
        }
        buf += c + (nx || ''); i += 2; continue;
      }
      if (c === '$') {
        if (s[i + 1] === '$') {
          const e = s.indexOf('$$', i + 2);
          if (e > 0) { flush(); const h = display(s.slice(i + 2, e), false, ctx); if (h) out.push(h); i = e + 2; continue; }
        }
        const e = closeDollar(s, i + 1);
        if (e > 0) { buf += s.slice(i, e + 1); i = e + 1; continue; }
        buf += c; i++; continue;
      }
      if (c === '\u0005') {
        const e = s.indexOf('\u0006', i);
        if (e > 0) { flush(); const h = ctx.verb[+s.slice(i + 1, e)]; if (h) out.push(h); i = e + 1; continue; }
      }
      if (c === '\n') {
        const m2 = /^\n[ \t]*(?:\n[ \t]*)+/.exec(s.slice(i, i + 400));
        if (m2) { flush(); i += m2[0].length; continue; }
        buf += ' '; i++; continue;
      }
      buf += c; i++;
    }
    flush();
    return out;
  }

  /* ---------------------------------------------------------------- environments */
  function listBlock(kind, body, ctx) {
    const re = /\\(begin|end)\{[^}]*\}|\\item(?![A-Za-z])/g;
    let m, depth = 0;
    const cuts = [];
    while ((m = re.exec(body))) {
      if (m[1] === 'begin') depth++;
      else if (m[1] === 'end') depth = Math.max(0, depth - 1);
      else if (depth === 0) cuts.push({ at: m.index, end: m.index + m[0].length });
    }
    if (!cuts.length) return '';
    const tag = kind === 'enumerate' ? 'ol' : 'ul';
    let html = '<' + tag + '>';
    cuts.forEach((c, k) => {
      let text = body.slice(c.end, k + 1 < cuts.length ? cuts[k + 1].at : body.length), term = '';
      if (kind === 'description') { const o = readOpt(text, 0); if (o.text !== null) { term = '<b>' + inline(o.text, ctx).trim() + '</b> '; text = text.slice(o.next); } }
      else if (text[0] === '[') { const o = readOpt(text, 0); if (o.text !== null) text = text.slice(o.next); }
      const bl = withCtx(ctx, null, null, () => parseBlocks(text, ctx));
      const inner = (bl.length === 1 && /^<p[^>]*>/.test(bl[0])) ? bl[0].replace(/^<p[^>]*>/, '').replace(/<\/p>$/, '') : bl.join('');
      html += '<li>' + term + inner + '</li>';
    });
    ctx.rep.lists++;
    return html + '</' + tag + '>';
  }
  function parseSpec(spec) {
    const t = spec.replace(/[@!<>]\{[^}]*\}/g, '').replace(/[pmb]\{[^}]*\}/g, 'l').replace(/[^lcrXS]/g, '');
    return [...t].map(ch => ch === 'c' ? 'center' : ch === 'r' ? 'right' : 'left');
  }
  function tabularHtml(spec, body, ctx) {
    const aligns = parseSpec(spec);
    const header = /\\midrule/.test(body) || (body.match(/\\hline/g) || []).length >= 2;
    const clean = body.replace(/\\(?:hline|toprule|midrule|bottomrule|endhead|endfirsthead|endfoot|endlastfoot)\b|\\cline\{[^}]*\}|\\cmidrule(?:\([^)]*\))?\{[^}]*\}/g, '');
    const rows = splitTop(clean, '\\\\').map((r, k) => (k ? r.replace(/^\s*\[\s*[-+]?[\d.]+\s*[a-z]{1,3}\s*\]/i, '') : r)).filter(r => r.trim());
    if (!rows.length) return '';
    const grid = rows.map(r => splitTop(r, '&').map(cell => {
      let text = cell.trim(), span = 1, al = null;
      let mm = /^\\multicolumn\s*\{(\d+)\}\s*\{([^}]*)\}\s*\{([\s\S]*)\}\s*$/.exec(text);
      if (mm) { span = Math.min(12, +mm[1] || 1); al = parseSpec(mm[2])[0] || null; text = mm[3]; }
      mm = /^\\multirow\s*\{[^}]*\}\s*\{[^}]*\}\s*\{([\s\S]*)\}\s*$/.exec(text);
      if (mm) text = mm[1];
      return { text, span, al };
    }));
    const cols = Math.max(...grid.map(r => r.reduce((a, c) => a + c.span, 0)));
    let html = '<table class="eq-table"><tbody>';
    grid.forEach((r, ri) => {
      const tag = (header && ri === 0) ? 'th' : 'td';
      html += '<tr>';
      let used = 0;
      r.forEach((c, ci) => {
        const al = c.al || aligns[used] || 'left';
        html += '<' + tag + (c.span > 1 ? ' colspan="' + c.span + '"' : '') + (al !== 'left' ? ' style="text-align:' + al + '"' : '') + '>' + (inline(c.text, ctx).trim() || '<br>') + '</' + tag + '>';
        used += c.span;
      });
      for (; used < cols; used++) html += '<' + tag + '><br></' + tag + '>';
      html += '</tr>';
    });
    return html + '</tbody></table>';
  }
  function tabularEnv(name, inner, ctx) {
    let j = readOpt(inner, 0).next, spec = '';
    if (name === 'tabular*' || name === 'tabularx' || name === 'tabulary') { const w = readArg(inner, j), sp = readArg(inner, w.next); spec = sp.text; j = sp.next; }
    else { const sp = readArg(inner, j); spec = sp.text; j = sp.next; }
    return tabularHtml(spec, inner.slice(j), ctx);
  }
  function tabularIn(b, ctx) {
    const m = /\\begin\{(tabular\*?|tabularx|longtable|tabulary)\}/.exec(b);
    if (!m) return '';
    const st = m.index + m[0].length, en = findEnd(b, m[1], st);
    return en < 0 ? '' : tabularEnv(m[1], b.slice(st, en), ctx);
  }
  function tableBlocks(body, ctx) {
    const id = uid();
    const b = body.replace(/^\s*\[[^\]]*\]/, '').replace(/\\label\{([^}]*)\}/g, (m, l) => { ctx.labels[l.trim()] = { id, type: 'tab' }; return ''; });
    const cap = findCmd(b, 'caption'), t = tabularIn(b, ctx), out = [];
    if (cap) out.push('<p class="eq-caption" data-cap="table" data-id="' + id + '">' + inline(cap.text, ctx).trim() + '</p>');
    if (t) out.push(t); else ctx.issues.push('A table could not be read (only tabular tables are supported).');
    ctx.rep.tables++;
    return out;
  }
  function figureBlocks(body, ctx) {
    const id = uid();
    const b = body.replace(/^\s*\[[^\]]*\]/, '').replace(/\\label\{([^}]*)\}/g, (m, l) => { ctx.labels[l.trim()] = { id, type: 'fig' }; return ''; });
    const imgs = [...b.matchAll(/\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)].map(m => m[1].trim());
    const main = b.replace(/\\begin\{subfigure\}[\s\S]*?\\end\{subfigure\}/g, '');
    const cap = findCmd(main, 'caption'), out = [];
    if (/\\begin\{tikzpicture\}/.test(b)) { out.push('<p class="eq-figure" style="text-align:center"><span class="eq-imgph">[TikZ drawing: not supported here]</span></p>'); ctx.issues.push('A TikZ drawing could not be imported (it is still in the PDF preview).'); }
    imgs.forEach(f => { ctx.pictures.push(f); out.push('<p class="eq-figure" style="text-align:center"><span class="eq-imgph">[Picture: ' + escT(f) + ']</span></p>'); });
    if (cap) out.push('<p class="eq-caption" data-cap="figure" data-id="' + id + '">' + inline(cap.text, ctx).trim() + '</p>');
    ctx.rep.figures++;
    return out;
  }
  function theoremBlocks(type, body, ctx) {
    const id = uid(), o = readOpt(body, 0);
    let inner = o.text !== null && /^\s*\[/.test(body) ? body.slice(o.next) : body;
    inner = inner.replace(/\\label\{([^}]*)\}/g, (m, l) => { ctx.labels[l.trim()] = { id, type: 'th' }; return ''; });
    const title = (o.text !== null && /^\s*\[/.test(body)) ? '(' + inline(o.text, ctx).trim() + ') ' : '';
    const blocks = withCtx(ctx, null, null, () => parseBlocks(inner, ctx));
    const attr = ' data-th="' + type + '" data-id="' + id + '"';
    const res = [];
    let first = true;
    blocks.forEach(b => {
      if (/^<p(\s|>)/.test(b)) {
        if (first) { res.push('<p class="eq-th"' + attr + '>' + title + b.replace(/^<p[^>]*>/, '').replace(/<\/p>$/, '') + '</p>'); first = false; }
        else res.push(b.replace(/^<p/, '<p class="eq-th eq-th-c"'));
      } else { if (first) { res.push('<p class="eq-th"' + attr + '>' + title + '</p>'); first = false; } res.push(b); }
    });
    if (first) res.push('<p class="eq-th"' + attr + '>' + title + '</p>');
    ctx.rep.theorems++;
    return res;
  }
  function envBlocks(name, body, ctx) {
    const star = name.endsWith('*'), base = name.replace(/\*$/, '');
    switch (base) {
      case 'document': return parseBlocks(body, ctx);
      case 'abstract': return ['<h1 class="eq-unnum" data-id="' + uid() + '">Abstract</h1>'].concat(parseBlocks(body, ctx));
      case 'itemize': case 'enumerate': case 'description': return [listBlock(base, body, ctx)];
      case 'equation': case 'align': case 'alignat': case 'flalign': case 'gather': case 'multline': case 'eqnarray': case 'displaymath': case 'math':
        return [displayEnv(base, star, body, ctx)];
      case 'figure': return figureBlocks(body, ctx);
      case 'table': return tableBlocks(body, ctx);
      case 'tabular': case 'tabularx': case 'tabulary': case 'longtable': { const t = tabularEnv(name, body, ctx); if (t) ctx.rep.tables++; return [t]; }
      case 'center': return withCtx(ctx, 'center', ctx.pclass, () => parseBlocks(body, ctx));
      case 'flushright': return withCtx(ctx, 'right', ctx.pclass, () => parseBlocks(body, ctx));
      case 'flushleft': return withCtx(ctx, null, ctx.pclass, () => parseBlocks(body, ctx));
      case 'quote': case 'quotation': case 'verse': return withCtx(ctx, ctx.align, 'eq-quote', () => parseBlocks(body, ctx));
      case 'titlepage': return withCtx(ctx, 'center', null, () => parseBlocks(body, ctx)).concat([PB]);
      case 'minipage': return parseBlocks(body.replace(/^\s*(\[[^\]]*\])?\s*\{[^}]*\}/, ''), ctx);
      case 'thebibliography': return bibBlocks(ctx);
      case 'tikzpicture': case 'pgfpicture': case 'algorithm': case 'algorithmic': case 'algorithm2e':
        ctx.issues.push('A “' + name + '” block could not be imported (it is still in the PDF preview).');
        return ['<p class="eq-figure" style="text-align:center"><span class="eq-imgph">[' + escT(name) + ': not supported here]</span></p>'];
      default: break;
    }
    const type = has(ctx.theo, base) ? ctx.theo[base] : (has(THEO_MAP, base) ? THEO_MAP[base] : '');
    if (type) return theoremBlocks(type, body, ctx);
    ctx.unsupported.add('\\begin{' + name + '}');
    return parseBlocks(body, ctx);
  }

  /* ---------------------------------------------------------------- preamble, macros, sources */
  function protectVerbatim(src, ctx) {
    src = src.replace(/\\begin\{(verbatim\*?|Verbatim|lstlisting|minted|alltt)\}(?:\[[^\]]*\])?(?:\{[^}]*\})?([\s\S]*?)\\end\{\1\}/g, (m, name, body) => {
      const idx = ctx.verb.length;
      ctx.verb.push('<p class="eq-code">' + escT(body.replace(/^\n/, '').replace(/\s+$/, '')).replace(/\n/g, '<br>') + '</p>');
      return '\n\u0005' + idx + '\u0006\n';
    });
    return src.replace(/\\verb\*?([^A-Za-z\s*])([\s\S]*?)\1/g, (m, d, body) => {
      const idx = ctx.verbi.length;
      ctx.verbi.push('<span style="font-family:Consolas,monospace">' + escT(body) + '</span>');
      return '\u0003' + idx + '\u0004';
    });
  }
  function stripComments(src) {
    src = src.replace(/\\begin\{comment\}[\s\S]*?\\end\{comment\}/g, '');
    return src.split('\n').map(line => {
      for (let i = 0; i < line.length; i++) { if (line[i] === '\\') { i++; continue; } if (line[i] === '%') return line.slice(0, i); }
      return line;
    }).join('\n');
  }
  function parseTheorems(src, ctx) {
    const re = /\\newtheorem\*?\s*\{(\w+)\}\s*(?:\[\w+\])?\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
      const nm = m[2].toLowerCase().replace(/[^a-z]/g, '');
      ctx.theo[m[1]] = has(NAME_TYPE, nm) ? NAME_TYPE[nm] : (has(THEO_MAP, m[1].toLowerCase()) ? THEO_MAP[m[1].toLowerCase()] : 'remark');
    }
  }
  function parseMacros(src, macros) {
    let m;
    const re = /\\(?:renewcommand|newcommand|providecommand)\*?\s*/g;
    while ((m = re.exec(src))) {
      let j = re.lastIndex, name;
      if (src[j] === '{') { const e = matchBrace(src, j); if (e < 0) continue; name = src.slice(j + 1, e).trim(); j = e + 1; }
      else { const mm = /^\\[A-Za-z]+|^\\./.exec(src.slice(j, j + 40)); if (!mm) continue; name = mm[0]; j += mm[0].length; }
      if (!/^\\[A-Za-z]+$/.test(name)) continue;
      const o1 = readOpt(src, j);
      let n = 0, def = null;
      if (o1.text !== null && /^\s*\d\s*$/.test(o1.text)) { n = +o1.text; j = o1.next; const o2 = readOpt(src, j); if (o2.text !== null) { def = o2.text; j = o2.next; } }
      const k = skipWs(src, j);
      if (src[k] !== '{') continue;
      const e = matchBrace(src, k);
      if (e < 0) continue;
      const body = src.slice(k + 1, e), key = name.slice(1);
      re.lastIndex = e + 1;
      if (new RegExp('\\\\' + key + '(?![A-Za-z])').test(body)) continue;
      macros[key] = { n, def, body };
    }
    const re2 = /\\def\s*\\([A-Za-z]+)((?:#\d)*)\s*\{/g;
    while ((m = re2.exec(src))) {
      const e = matchBrace(src, re2.lastIndex - 1);
      if (e < 0) continue;
      const body = src.slice(re2.lastIndex, e);
      re2.lastIndex = e + 1;
      if (!new RegExp('\\\\' + m[1] + '(?![A-Za-z])').test(body)) macros[m[1]] = { n: (m[2].match(/#/g) || []).length, def: null, body };
    }
    const re3 = /\\DeclareMathOperator(\*?)\s*\{?\s*\\([A-Za-z]+)\s*\}?\s*\{([^}]*)\}/g;
    while ((m = re3.exec(src))) macros[m[2]] = { n: 0, def: null, body: '\\operatorname{' + m[3] + '}' };
  }
  function expandMacros(s, macros) {
    if (!Object.keys(macros).length) return s;
    for (let pass = 0; pass < 8; pass++) {
      let changed = false, out = '', i = 0;
      while (i < s.length) {
        const c = s[i];
        if (c === '\\') {
          const m = /^\\([A-Za-z]+)/.exec(s.slice(i, i + 60));
          if (m && macros[m[1]]) {
            const mac = macros[m[1]], args = [];
            let j = i + m[0].length, k = 0;
            if (mac.n > 0) {
              if (mac.def !== null) {
                const o = readOpt(s, j);
                if (o.text !== null) { args[0] = o.text; j = o.next; } else args[0] = mac.def;
                k = 1;
              }
              for (; k < mac.n; k++) { const a = readArg(s, j); args[k] = a.text; j = a.next; }
            }
            out += mac.body.replace(/#(\d)/g, (mm, d) => (args[+d - 1] !== undefined ? args[+d - 1] : ''));
            i = j; changed = true; continue;
          }
          if (m) { out += m[0]; i += m[0].length; continue; }
          out += c + (s[i + 1] || ''); i += 2; continue;
        }
        out += c; i++;
      }
      s = out;
      if (!changed || s.length > 3e6) break;
    }
    return s;
  }
  function prescanBib(body, ctx) {
    const m = /\\begin\{thebibliography\}\s*\{[^}]*\}([\s\S]*?)\\end\{thebibliography\}/.exec(body);
    if (!m) return;
    m[1].split(/\\bibitem/).slice(1).forEach(part => {
      const mm = /^\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}([\s\S]*)$/.exec(part);
      if (!mm) return;
      const key = mm[1].trim();
      if (!key || srcFor(key, ctx)) return;
      const raw = plain(inline(mm[2], ctx)).slice(0, 600);
      ctx.newSources.push({ id: uid(), key, type: 'web', authors: '', year: '', title: raw.slice(0, 140), container: '', publisher: '', volume: '', issue: '', pages: '', url: '', raw });
      ctx.hasBibItems = true;
    });
    if (!ctx.hasBibItems && ctx.newSources.length === 0 && ctx.existing.length) ctx.hasBibItems = false;
  }
  function resolveRefs(html, ctx) {
    html = html.replace(/(Figure|Fig\.|Table|Section|Sec\.|Chapter|Theorem|Lemma|Proposition|Corollary|Definition|Remark|Example)((?:\s|\u00A0)*)\u0001(\w+):([^\u0002]*)\u0002/g, (m, word, sp, cmd, labels) => {
      const t = ctx.labels[labels.split(',')[0].trim()];
      return (t && t.type !== 'eq') ? '\u0001' + cmd + ':' + labels + '\u0002' : m;
    });
    return html.replace(/\u0001(\w+):([^\u0002]*)\u0002/g, (m, cmd, labels) => {
      if (cmd === 'pageref') return '?';
      return labels.split(',').map(l => {
        l = l.trim();
        const t = ctx.labels[l];
        if (!t) { ctx.rep.missingRefs.add(l); return '??'; }
        return '<span class="eq-xref" data-ref="' + t.id + '" contenteditable="false">…</span>';
      }).join(', ');
    });
  }

  /* ---------------------------------------------------------------- main conversion */
  window.eqLatexToHtml = function (src0) {
    const ctx = newCtx();
    let src = String(src0 || '').replace(/\r\n?/g, '\n');
    if (src.length > 3e6) return { error: 'That LaTeX is too large (max 3 MB).' };
    if (/\\documentclass(\[[^\]]*\])?\{beamer\}/.test(src)) return { error: 'Beamer slides cannot become a document. Use the LaTeX Studio preview for slides.' };
    src = stripComments(protectVerbatim(src, ctx));
    const di = src.indexOf('\\begin{document}');
    let pre = src, body = src;
    if (di >= 0) {
      pre = src.slice(0, di); body = src.slice(di + 16);
      const de = body.lastIndexOf('\\end{document}');
      if (de >= 0) body = body.slice(0, de);
    }
    const cm = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(src);
    ctx.hasChapter = !!(cm && /^(report|book|memoir|scrreprt|scrbook)$/.test(cm[1].trim()));
    parseTheorems(src, ctx);
    parseMacros(src, ctx.macros);
    ['title', 'author', 'date'].forEach(k => { const f = findCmd(pre, k); if (f) ctx.meta[k] = f.text; });
    body = expandMacros(body, ctx.macros);
    Object.keys(ctx.meta).forEach(k => { ctx.meta[k] = expandMacros(ctx.meta[k], ctx.macros); });
    prescanBib(body, ctx);
    const blocks = parseBlocks(body, ctx);
    const html = resolveRefs(blocks.join('\n'), ctx);
    const r = ctx.rep;
    return {
      html,
      report: {
        counts: { headings: r.headings, equations: r.equations, inlineMath: r.math, tables: r.tables, figures: r.figures, lists: r.lists, theorems: r.theorems, citations: r.citations, footnotes: r.footnotes },
        issues: ctx.issues.slice(0, 20), unsupported: [...ctx.unsupported].slice(0, 25), pictures: [...new Set(ctx.pictures)],
        mathBad: ctx.mathBad, missingCites: [...r.missingCites], missingRefs: [...r.missingRefs],
        newSources: ctx.newSources, ieee: ctx.hasBibItems, numbered: r.numbered
      }
    };
  };

  /* ---------------------------------------------------------------- putting the result into the document */
  function commit(res, mode, look) {
    const rep = res.report;
    if (rep.newSources.length) {
      store.set('eqSources', JSON.stringify(readSources().concat(rep.newSources)));
      if (rep.ieee) { store.set('eqCiteStyle', 'ieee'); const sel = $('#selCiteStyle'); if (sel) sel.value = 'ieee'; }
    }
    if (rep.numbered) { root.classList.add('hnum'); store.set('hnum', '1'); const b = $('#btnHnum'); if (b) b.classList.add('on'); }
    const clean = sanitizeHtml(res.html);
    if (mode === 'replace') {
      clearTimeout(hTimer); pushHistory();
      restoreDoc(clean, true);
      afterChange(true); pushHistory();
    } else {
      const tpl = document.createElement('template');
      tpl.innerHTML = clean;
      const nodes = [...tpl.content.children];
      if (!nodes.length) return;
      const first = nodes[0];
      eqBlocks.insertBlock(first);
      let ref = first;
      nodes.slice(1).forEach(n => { ref.after(n); ref = n; });
      nodes.forEach(n => n.querySelectorAll('math-field').forEach(mf => { const v = mf.getAttribute('value'); setupMathField(mf); if (v != null) { try { mf.value = v; } catch (e) { /* shown empty */ } } }));
      afterChange(true);
      if (nodes[0].scrollIntoView) nodes[0].scrollIntoView({ block: 'start' });
    }
    try { if (window.eqLxAfterCommit) window.eqLxAfterCommit(res, mode, look); } catch (e) { reportError('latex-style', e); }
    if (window.eqUpdateAll) setTimeout(() => window.eqUpdateAll(true), 50);
  }
  function showReport(rep) {
    const c = rep.counts;
    const parts = [];
    [['headings', 'headings'], ['equations', 'display equations'], ['inlineMath', 'inline formulas'], ['tables', 'tables'], ['figures', 'figures'], ['lists', 'lists'], ['theorems', 'theorem blocks'], ['citations', 'citations'], ['footnotes', 'footnotes']]
      .forEach(([k, label]) => { if (c[k]) parts.push(c[k] + ' ' + label); });
    const summary = parts.length ? parts.join(' · ') : 'text';
    const problems = rep.issues.length + rep.unsupported.length + rep.pictures.length + rep.mathBad.length + rep.missingCites.length + rep.missingRefs.length;
    if (!problems) { showToast('Imported: ' + summary); return; }
    const list = a => '<ul class="imp-list">' + a.map(x => '<li>' + eqEsc(x) + '</li>').join('') + '</ul>';
    let h = '<h3>Imported</h3><p class="help-text">' + eqEsc(summary) + '</p>';
    if (rep.issues.length) h += '<div class="imp-h">Please check</div>' + list(rep.issues);
    if (rep.pictures.length) h += '<div class="imp-h">Pictures (add them with Insert → Pictures)</div>' + list(rep.pictures);
    if (rep.missingCites.length) h += '<div class="imp-h">Citations without a source: import your .bib (References → Manage Sources), then convert again</div>' + list(rep.missingCites.slice(0, 15));
    if (rep.missingRefs.length) h += '<div class="imp-h">References to labels that were not found</div>' + list(rep.missingRefs.slice(0, 15));
    if (rep.mathBad.length) h += '<div class="imp-h">Formulas this editor may not display (open them with Equation → LaTeX…)</div>' + list(rep.mathBad);
    if (rep.unsupported.length) h += '<div class="imp-h">Commands that were skipped</div>' + list(rep.unsupported);
    const ov = eqEl('div', 'eqmodal open'), card = eqEl('div', 'eqmodal-card');
    card.style.width = '540px'; card.style.maxHeight = '80vh'; card.style.overflow = 'auto'; card.innerHTML = h;
    const a = eqEl('div', 'eqmodal-actions'), ok = eqEl('button', 'btn btn-primary', 'OK');
    ok.type = 'button'; ok.addEventListener('click', () => ov.remove()); a.appendChild(ok); card.appendChild(a); ov.appendChild(card);
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
    ov.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') ov.remove(); });
    document.body.appendChild(ov); ok.focus();
  }
  window.eqOpenLatexImport = function (prefill, onDone) {
    eqUI.form('Import LaTeX', [
      { id: 'src', label: 'LaTeX code (a whole document, or just a part)', type: 'textarea', rows: 12, value: prefill || '', placeholder: '\\documentclass{article}\n\\begin{document}\n...\n\\end{document}' },
      { id: 'mode', label: 'What to do', type: 'select', value: isEmpty() ? 'replace' : 'insert', options: [['insert', 'Insert at the cursor'], ['replace', 'Replace the whole document'], ['text', 'Paste as plain text (no conversion)']] },
      { id: 'look', label: 'Use the LaTeX look (fonts, colors, margins, page numbers) when replacing the document', type: 'checkbox', value: true }
    ], v => {
      const src = v.src.trim();
      if (!src) { showToast('Paste some LaTeX first', 'warn'); return false; }
      if (v.mode === 'text') { eqRestoreSel(); document.execCommand('insertText', false, v.src); return true; }
      let res;
      try { res = window.eqLatexToHtml(src); } catch (e) { reportError('latex-import', e); showToast('Could not read that LaTeX', 'error'); return false; }
      if (res.error) { showToast(res.error, 'warn'); return false; }
      try { commit(res, v.mode, v.look); } catch (e) { reportError('latex-import', e); showToast('Import failed. Your document was not changed.', 'error'); return false; }
      showReport(res.report);
      if (onDone) onDone();
      return true;
    }, { width: '680px', okText: 'Convert' });
  };

  /* ---------------------------------------------------------------- hooks: button + pasting a whole document */
  const btn = $('#btnImportTex');
  if (btn) on(btn, 'click', () => window.eqOpenLatexImport(''));
  const looksLikeLatex = t => /\\documentclass|\\begin\{document\}/.test(t) || (/\\(chapter|section|subsection)\*?\{/.test(t) && (t.match(/\\[A-Za-z]+/g) || []).length >= 6);
  doc.addEventListener('paste', e => {
    if (e.target && e.target.tagName === 'MATH-FIELD') return;
    const t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (t.length < 80 || !looksLikeLatex(t)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    window.eqOpenLatexImport(t);
  }, true);
})();
