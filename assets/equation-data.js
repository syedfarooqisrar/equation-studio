/* 📁 FILE: assets/equation-data.js
   All equation menus: structures (GROUPS), built-in formulas (GALLERY) and symbols (SYM).
   Item format: [latex, tooltip, preview].  #@ = selected text / first slot,  #? = empty slot. */

const P = s => s.replace(/#[@?]/g, '\\Box');                    // default preview: empty slots shown as boxes
const S = (title, cols, items, opts) => {
  const pv = opts && opts.pv;                                    // pv: text shown instead of a box (accents look like accents)
  const pr = pv ? (s => s.replace(/#@/g, pv).replace(/#\?/g, '\\Box')) : P;
  return Object.assign({
    title, cols,
    items: items.map(x => typeof x === 'string' ? [x, '', pr(x)] : [x[0], x[1] || '', x[2] || pr(x[0])])
  }, opts || {});
};
const grid = (r, c) => Array.from({ length: r }, () => Array(c).fill('#?').join('&')).join('\\\\');
const mat = (env, r, c) => `\\begin{${env}}${grid(r, c)}\\end{${env}}`;
const sized = (env, list) => list.map(([r, c]) => [mat(env, r, c), `${r}×${c} matrix`]);

const GROUPS = [
 { name:'Structures', items:[
  { label:'Fraction', icon:'<span class="ico-text">x⁄y</span>', cw:84, sections:[
    S('Fraction',4,[
      ['\\frac{#@}{#?}','Stacked fraction'],
      ['{}^{#@}\\!\\!/\\!{}_{#?}','Skewed fraction'],
      ['#@/#?','Linear fraction'],
      ['\\tfrac{#@}{#?}','Small fraction'],
      ['\\dfrac{#@}{#?}','Display-style fraction'],
      ['\\cfrac{#@}{#?}','Continued fraction']]),
    S('Common Fractions',4,[
      ['\\dfrac{d#@}{d#?}','Derivative','\\dfrac{dy}{dx}'],
      ['\\dfrac{\\Delta #@}{\\Delta #?}','Change','\\dfrac{\\Delta y}{\\Delta x}'],
      ['\\dfrac{\\partial #@}{\\partial #?}','Partial derivative','\\dfrac{\\partial y}{\\partial x}'],
      ['\\dfrac{\\delta #@}{\\delta #?}','Variation','\\dfrac{\\delta y}{\\delta x}'],
      ['\\dfrac{d^{2}#@}{d#?^{2}}','Second derivative','\\dfrac{d^{2}y}{dx^{2}}'],
      ['\\dfrac{\\partial^{2}#@}{\\partial #?^{2}}','Second partial derivative','\\dfrac{\\partial^{2}y}{\\partial x^{2}}'],
      ['\\dfrac{\\pi}{2}','π / 2'],
      ['\\dfrac{1}{2}','One half']])]},

  { label:'Script', icon:'e<sup style="font-size:11px">x</sup>', cw:80, sections:[
    S('Script',4,[
      ['#@^{#?}','Superscript'],
      ['#@_{#?}','Subscript'],
      ['#@_{#?}^{#?}','Subscript and superscript'],
      ['{}_{#?}^{#?}#@','Left sub-superscript'],
      ['{}^{#?}#@','Left superscript'],
      ['{}_{#?}#@','Left subscript'],
      ["#@'",'Prime'],
      ["#@''",'Double prime']]),
    S('Common Scripts',4,[
      'e^{-i\\omega t}','x^{2}','x^{-1}','x_{i}','Y_{1}^{n}','a^{b^{c}}','x^{\\frac{1}{2}}','10^{-3}',
      ['#@\\times10^{#?}','Scientific notation'],['{}^{n}C_{r}','Combination']])]},

  { label:'Radical', icon:'√x', cw:84, sections:[
    S('Radicals',4,[
      ['\\sqrt{#@}','Square root'],
      ['\\sqrt[#?]{#@}','Radical with degree'],
      ['\\sqrt[2]{#@}','Square root with degree'],
      ['\\sqrt[3]{#@}','Cube root'],
      ['\\sqrt[4]{#@}','Fourth root']]),
    S('Common Radicals',2,[
      ['x=\\dfrac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}','Quadratic formula'],
      ['\\sqrt{a^{2}+b^{2}}','Hypotenuse'],
      ['\\sqrt{\\dfrac{#@}{#?}}','Root of a fraction'],
      ['\\sqrt[n]{a^{m}}','nth root of a power']])]},

  { label:'Integral', icon:'∫', cw:96, sections:[
    S('Integrals',3,[
      ['\\int #?\\,d#?','Integral'],
      ['\\iint #?\\,dA','Double integral'],
      ['\\iiint #?\\,dV','Triple integral'],
      ['\\oint #?\\,ds','Contour integral'],
      ['\\oint_{S}#?\\,dS','Surface integral'],
      ['\\iiint_{V}#?\\,dV','Volume integral']]),
    S('With Limits',3,[
      ['\\int_{#?}^{#?}#?\\,d#?','Definite integral'],
      ['\\int\\limits_{#?}^{#?}#?\\,d#?','Limits above and below'],
      ['\\iint_{#?}#?\\,dA','Double integral over a region'],
      ['\\oint_{#?}#?\\,ds','Contour integral over a curve'],
      ['\\int_{-\\infty}^{\\infty}#?\\,d#?','Improper (−∞ to ∞)'],
      ['\\int_{0}^{\\infty}#?\\,d#?','Improper (0 to ∞)'],
      ['\\left[#?\\right]_{#?}^{#?}','Evaluated between limits']]),
    S('Common Integrals',2,[
      ['\\int x^{n}\\,dx=\\dfrac{x^{n+1}}{n+1}+C','Power rule'],
      ['\\int\\dfrac{1}{x}\\,dx=\\ln|x|+C','1/x'],
      ['\\int e^{x}\\,dx=e^{x}+C','Exponential'],
      ['\\int\\sin x\\,dx=-\\cos x+C','Sine'],
      ['\\int\\cos x\\,dx=\\sin x+C','Cosine'],
      ['\\int u\\,dv=uv-\\int v\\,du','Integration by parts'],
      ['\\int_{a}^{b}f(x)\\,dx=F(b)-F(a)','Fundamental theorem'],
      ['\\int_{-\\infty}^{\\infty}e^{-x^{2}}\\,dx=\\sqrt{\\pi}','Gaussian integral']])]},

  { label:'Large Operator', icon:'Σ', cw:96, sections:[
    S('Summation',3,[
      ['\\sum_{#?}^{#?}#?','Summation with limits'],
      ['\\sum\\nolimits_{#?}^{#?}#?','Limits beside the symbol'],
      ['\\sum_{#?}#?','Summation, lower limit only'],
      ['\\sum_{\\begin{matrix}#?\\\\#?\\end{matrix}}#?','Two conditions'],
      ['\\sum #?','Summation, no limits']]),
    S('Product and Coproduct',3,[
      ['\\prod_{#?}^{#?}#?','Product with limits'],
      ['\\prod\\nolimits_{#?}^{#?}#?','Limits beside the symbol'],
      ['\\prod_{#?}#?','Product, lower limit only'],
      ['\\coprod_{#?}^{#?}#?','Coproduct']]),
    S('Union, Intersection and Others',3,[
      ['\\bigcup_{#?}^{#?}#?','Union'],
      ['\\bigcap_{#?}^{#?}#?','Intersection'],
      ['\\bigvee_{#?}^{#?}#?','Logical OR'],
      ['\\bigwedge_{#?}^{#?}#?','Logical AND'],
      ['\\bigoplus_{#?}^{#?}#?','Direct sum'],
      ['\\bigotimes_{#?}^{#?}#?','Tensor product']]),
    S('Common',2,[
      ['\\sum_{i=1}^{n}i=\\dfrac{n(n+1)}{2}','Sum of integers'],
      ['\\sum_{i=1}^{n}i^{2}=\\dfrac{n(n+1)(2n+1)}{6}','Sum of squares'],
      ['\\sum_{k=0}^{\\infty}\\dfrac{x^{k}}{k!}=e^{x}','Exponential series'],
      ['\\sum_{k=0}^{n}\\binom{n}{k}a^{k}b^{n-k}','Binomial sum'],
      ['\\prod_{i=1}^{n}i=n!','Factorial']])]},

  { label:'Bracket', icon:'{( )}', cw:84, sections:[
    S('Brackets (they grow with content)',4,[
      ['\\left(#@\\right)','Parentheses'],
      ['\\left[#@\\right]','Square brackets'],
      ['\\left\\{#@\\right\\}','Braces'],
      ['\\left\\langle #@\\right\\rangle','Angle brackets'],
      ['\\left\\lfloor #@\\right\\rfloor','Floor'],
      ['\\left\\lceil #@\\right\\rceil','Ceiling'],
      ['\\left|#@\\right|','Absolute value'],
      ['\\left\\|#@\\right\\|','Norm']]),
    S('Intervals and Separators',4,[
      ['\\left[#@,#?\\right]','Closed interval'],
      ['\\left(#@,#?\\right)','Open interval'],
      ['\\left[#@,#?\\right)','Half-open [a, b)'],
      ['\\left(#@,#?\\right]','Half-open (a, b]'],
      ['\\left\\{#@\\,\\middle|\\,#?\\right\\}','Set builder'],
      ['\\left\\langle #@\\middle|#?\\right\\rangle','Bra-ket'],
      ['\\left.#@\\right|_{#?}','Evaluated at'],
      ['\\left.#@\\right|_{#?}^{#?}','Evaluated between']]),
    S('Single Brackets',4,[
      '(#@','#@)','[#@','#@]','\\{#@','#@\\}','\\langle #@','#@\\rangle'])]},

  { label:'Function', icon:'sinθ', cw:90, sections:[
    S('Trigonometric',4,['\\sin(#?)','\\cos(#?)','\\tan(#?)','\\csc(#?)','\\sec(#?)','\\cot(#?)']),
    S('Trigonometric Powers',4,['\\sin^{2}(#?)','\\cos^{2}(#?)','\\tan^{2}(#?)','\\sin^{#?}(#?)']),
    S('Inverse Trigonometric',4,['\\sin^{-1}(#?)','\\cos^{-1}(#?)','\\tan^{-1}(#?)','\\arcsin(#?)','\\arccos(#?)','\\arctan(#?)','\\operatorname{arccot}(#?)','\\operatorname{arcsec}(#?)']),
    S('Hyperbolic',4,['\\sinh(#?)','\\cosh(#?)','\\tanh(#?)','\\coth(#?)','\\operatorname{sech}(#?)','\\operatorname{csch}(#?)','\\sinh^{-1}(#?)','\\operatorname{arsinh}(#?)']),
    S('Logarithms and Exponentials',4,['\\log(#?)','\\ln(#?)','\\lg(#?)','\\log_{#?}(#?)','\\log_{10}(#?)','\\log_{2}(#?)','\\exp(#?)','e^{#?}']),
    S('Other Functions',4,['\\det(#?)','\\dim(#?)','\\ker(#?)','\\gcd(#?)','\\operatorname{lcm}(#?)','\\arg(#?)','\\deg(#?)','\\Pr(#?)','\\operatorname{sgn}(#?)','#@\\bmod #?','\\pmod{#?}','\\operatorname{Re}(#?)','\\operatorname{Im}(#?)']),
    S('Common',2,['\\sin\\theta','\\cos 2x','\\tan\\theta=\\dfrac{\\sin\\theta}{\\cos\\theta}','\\sin^{2}\\theta+\\cos^{2}\\theta=1'])]},

  { label:'Accent', icon:'ä', cw:84, sections:[
    S('Accents',4,[
      ['\\dot{#@}','Dot'],['\\ddot{#@}','Double dot'],['\\dddot{#@}','Triple dot'],['\\hat{#@}','Hat'],
      ['\\widehat{#@}','Wide hat'],['\\check{#@}','Check'],['\\acute{#@}','Acute'],['\\grave{#@}','Grave'],
      ['\\breve{#@}','Breve'],['\\tilde{#@}','Tilde'],['\\widetilde{#@}','Wide tilde'],['\\bar{#@}','Bar'],
      ['\\vec{#@}','Vector arrow'],['\\mathring{#@}','Ring']],
      { pv:'x', note:'Tip: type the letter first, then pick an accent. It goes on that letter.' }),
    S('Bars, Arrows and Braces',4,[
      ['\\overline{#@}','Overbar'],['\\underline{#@}','Underbar'],
      ['\\overrightarrow{#@}','Arrow over (right)'],['\\overleftarrow{#@}','Arrow over (left)'],
      ['\\overleftrightarrow{#@}','Arrow over (both)'],
      ['\\overbrace{#@}^{#?}','Overbrace'],['\\underbrace{#@}_{#?}','Underbrace']], { pv:'xyz' }),
    S('Boxes and Strikes',4,[
      ['\\boxed{#@}','Boxed formula'],['\\enclose{circle}{#@}','Circled'],['\\enclose{roundedbox}{#@}','Rounded box'],
      ['\\cancel{#@}','Strike ╱'],['\\bcancel{#@}','Strike ╲'],['\\xcancel{#@}','Strike ╳'],
      ['\\phantom{#@}','Invisible (keeps space)','\\text{hidden}']], { pv:'x+y' })]},

  { label:'Limit and Log', icon:'<span style="font-size:11px;line-height:1.1;text-align:center">lim<br>n→∞</span>', cw:96, sections:[
    S('Limits',3,['\\lim_{#? \\to #?}','\\lim_{#? \\to \\infty}','\\lim_{#? \\to 0}','\\lim_{#? \\to #?^{+}}','\\lim_{#? \\to #?^{-}}','\\limsup_{#?}','\\liminf_{#?}']),
    S('Min and Max',3,['\\max_{#?}','\\min_{#?}','\\sup_{#?}','\\inf_{#?}','\\max(#?,#?)','\\min(#?,#?)','\\arg\\max_{#?}','\\arg\\min_{#?}']),
    S('Logarithms',4,['\\log(#?)','\\ln(#?)','\\log_{#?}(#?)','\\log_{10}(#?)']),
    S('Common Limits',2,[
      ['\\lim_{x\\to0}\\dfrac{\\sin x}{x}=1','Sine limit'],
      ['\\lim_{n\\to\\infty}\\left(1+\\dfrac{1}{n}\\right)^{n}=e','Definition of e'],
      ['\\lim_{x\\to a}\\dfrac{f(x)-f(a)}{x-a}','Derivative at a point'],
      ['\\lim_{x\\to a}\\dfrac{f(x)}{g(x)}=\\lim_{x\\to a}\\dfrac{f\'(x)}{g\'(x)}',"L'Hôpital's rule"]])]},

  { label:'Operator', icon:'<span class="ico-text">:=</span>', cw:96, sections:[
    S('Operators',3,[
      [':=','Colon equal'],['::=','Double colon equal'],['==','Equal equal'],['+=','Plus equal'],['-=','Minus equal'],
      ['\\triangleq','Delta equal'],['\\overset{\\text{def}}{=}','Equal by definition'],['\\overset{#?}{=}','Equal with text above'],
      ['\\underset{#?}{=}','Equal with text below']]),
    S('Stretchy Arrows',2,[
      ['\\xrightarrow[#?]{#?}','Right arrow with labels'],['\\xleftarrow[#?]{#?}','Left arrow with labels'],
      ['\\xRightarrow[#?]{#?}','Implies with labels'],['\\xrightleftharpoons[#?]{#?}','Equilibrium with labels'],
      ['\\overset{#?}{\\longrightarrow}','Long arrow, text above'],['\\underset{#?}{\\longrightarrow}','Long arrow, text below']])]},

  { label:'Matrix', icon:'<span style="font-size:12px;line-height:1.1;text-align:center">[1 0<br>0 1]</span>', cw:104, sections:[
    S('Empty Matrices',4,sized('pmatrix',[[1,2],[2,1],[1,3],[3,1],[2,2],[2,3],[3,2],[3,3],[4,4]])),
    S('Brackets (2×2)',4,[
      [mat('matrix',2,2),'No brackets'],[mat('bmatrix',2,2),'Square brackets'],[mat('Bmatrix',2,2),'Braces'],
      [mat('vmatrix',2,2),'Determinant bars'],[mat('Vmatrix',2,2),'Double bars'],
      [mat('bmatrix',3,3),'Square brackets 3×3'],[mat('vmatrix',3,3),'Determinant 3×3']]),
    S('Identity and Special',4,[
      ['\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}','Identity 2×2'],
      ['\\begin{pmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{pmatrix}','Identity 3×3'],
      ['\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}','Identity 2×2 [ ]'],
      ['\\begin{bmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}','Identity 3×3 [ ]'],
      ['\\begin{pmatrix}0&0\\\\0&0\\end{pmatrix}','Zero 2×2'],
      ['\\begin{pmatrix}0&0&0\\\\0&0&0\\\\0&0&0\\end{pmatrix}','Zero 3×3'],
      ['\\begin{pmatrix}#?&0&0\\\\0&#?&0\\\\0&0&#?\\end{pmatrix}','Diagonal 3×3'],
      ['\\begin{pmatrix}#?&#?&#?\\\\0&#?&#?\\\\0&0&#?\\end{pmatrix}','Upper triangular 3×3']]),
    S('With Dots',2,[
      ['\\begin{pmatrix}a_{11}&\\cdots&a_{1n}\\\\\\vdots&\\ddots&\\vdots\\\\a_{m1}&\\cdots&a_{mn}\\end{pmatrix}','m × n matrix'],
      ['\\begin{bmatrix}a_{11}&\\cdots&a_{1n}\\\\\\vdots&\\ddots&\\vdots\\\\a_{m1}&\\cdots&a_{mn}\\end{bmatrix}','m × n matrix [ ]'],
      ['\\begin{pmatrix}a_{1}\\\\\\vdots\\\\a_{n}\\end{pmatrix}','Column vector'],
      ['\\begin{pmatrix}a_{1}&\\cdots&a_{n}\\end{pmatrix}','Row vector'],
      ['\\begin{pmatrix}1&\\cdots&0\\\\\\vdots&\\ddots&\\vdots\\\\0&\\cdots&1\\end{pmatrix}','Identity n × n'],
      ['\\begin{pmatrix}a_{1}&&\\\\&\\ddots&\\\\&&a_{n}\\end{pmatrix}','Diagonal n × n']]),
    S('Augmented Matrices',2,[
      ['\\left[\\begin{array}{cc|c}#?&#?&#?\\\\#?&#?&#?\\end{array}\\right]','2 equations'],
      ['\\left[\\begin{array}{ccc|c}#?&#?&#?&#?\\\\#?&#?&#?&#?\\\\#?&#?&#?&#?\\end{array}\\right]','3 equations']])]}
 ]},

 { name:'Layout', items:[
  { label:'Cases', icon:'<span style="font-size:22px">{</span>', cw:110, sections:[
    S('Piecewise / Cases',3,[
      [mat('cases',2,2),'2 cases'],[mat('cases',3,2),'3 cases'],[mat('cases',4,2),'4 cases']]),
    S('Systems of Equations',3,[
      ['\\left\\{\\begin{array}{l}#?\\\\#?\\end{array}\\right.','2 equations'],
      ['\\left\\{\\begin{array}{l}#?\\\\#?\\\\#?\\end{array}\\right.','3 equations'],
      ['\\left\\{\\begin{array}{l}#?\\\\#?\\\\#?\\\\#?\\end{array}\\right.','4 equations']])]},
  { label:'Aligned', icon:'<span style="font-size:15px;line-height:1.1;text-align:left">a=b<br>&nbsp;=c</span>', cw:120, sections:[
    S('Step-by-step lines (aligned at =)',3,[
      ['\\begin{aligned}#?&=#?\\\\&=#?\\end{aligned}','2 lines'],
      ['\\begin{aligned}#?&=#?\\\\&=#?\\\\&=#?\\end{aligned}','3 lines'],
      ['\\begin{aligned}#?&=#?\\\\&=#?\\\\&=#?\\\\&=#?\\end{aligned}','4 lines'],
      ['\\begin{aligned}#?&<#?\\\\&<#?\\end{aligned}','Inequality chain']])]},
  { label:'Binomial', icon:'(ⁿₖ)', cw:96, sections:[
    S('Binomial',3,[
      ['\\binom{#@}{#?}','Binomial coefficient'],['\\dbinom{#@}{#?}','Display binomial'],['\\tbinom{#@}{#?}','Small binomial'],
      ['\\begin{matrix}#?\\\\#?\\end{matrix}','Stack (no brackets)']])]},
  { label:'Style', icon:'<b style="font-family:serif;font-size:17px">A</b>', cw:90, sections:[
    S('Font Style',4,[
      ['\\mathbf{#@}','Bold','\\mathbf{Ab}'],['\\mathit{#@}','Italic','\\mathit{Ab}'],['\\mathrm{#@}','Roman (upright)','\\mathrm{Ab}'],
      ['\\mathbb{#@}','Double-struck','\\mathbb{R}'],['\\mathcal{#@}','Calligraphic','\\mathcal{L}'],['\\mathfrak{#@}','Fraktur','\\mathfrak{g}'],
      ['\\mathsf{#@}','Sans-serif','\\mathsf{Ab}'],['\\mathtt{#@}','Monospace','\\mathtt{Ab}'],
      ['\\boldsymbol{#@}','Bold symbol (Greek)','\\boldsymbol{\\alpha}'],['\\operatorname{#?}','Operator name','\\operatorname{op}'],
      ['\\text{#?}','Normal text','\\text{text}']])]},
  { label:'Spacing', icon:'<span class="ico-text">␣</span>', cw:90, sections:[
    S('Spacing',3,[
      ['\\,','Thin space','\\text{thin}'],['\\:','Medium space','\\text{medium}'],['\\;','Thick space','\\text{thick}'],
      ['\\quad','Quad space','\\text{quad}'],['\\qquad','Double quad space','\\text{qquad}'],['\\!','Negative thin space','\\text{neg.}']])]}
 ]}
];

/* ---- Built-in equation gallery (Word's list + many more for maths students) ---- */
const G = (title, arr) => S(title, 1, arr.map(([n, l]) => [l, n]), { labeled:true, newEq:true });
const GALLERY = [
 G('Built-in',[
  ['Area of Circle','A=\\pi r^{2}'],
  ['Binomial Theorem','(x+a)^{n}=\\sum_{k=0}^{n}\\binom{n}{k}x^{k}a^{n-k}'],
  ['Expansion of a Sum','(1+x)^{n}=1+\\frac{nx}{1!}+\\frac{n(n-1)x^{2}}{2!}+\\cdots'],
  ['Fourier Series','f(x)=a_{0}+\\sum_{n=1}^{\\infty}\\left(a_{n}\\cos\\frac{n\\pi x}{L}+b_{n}\\sin\\frac{n\\pi x}{L}\\right)'],
  ['Pythagorean Theorem','a^{2}+b^{2}=c^{2}'],
  ['Quadratic Formula','x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}'],
  ['Taylor Expansion','e^{x}=1+\\frac{x}{1!}+\\frac{x^{2}}{2!}+\\frac{x^{3}}{3!}+\\cdots'],
  ['Trig Identity 1','\\sin\\alpha\\pm\\sin\\beta=2\\sin\\frac{1}{2}(\\alpha\\pm\\beta)\\cos\\frac{1}{2}(\\alpha\\mp\\beta)'],
  ['Trig Identity 2','\\cos\\alpha+\\cos\\beta=2\\cos\\frac{1}{2}(\\alpha+\\beta)\\cos\\frac{1}{2}(\\alpha-\\beta)'],
  ['Law of Cosines','c^{2}=a^{2}+b^{2}-2ab\\cos C']]),
 G('Algebra',[
  ['Difference of squares','a^{2}-b^{2}=(a-b)(a+b)'],
  ['Square of a sum','(a+b)^{2}=a^{2}+2ab+b^{2}'],
  ['Square of a difference','(a-b)^{2}=a^{2}-2ab+b^{2}'],
  ['Cube of a sum','(a+b)^{3}=a^{3}+3a^{2}b+3ab^{2}+b^{3}'],
  ['Sum of cubes','a^{3}+b^{3}=(a+b)(a^{2}-ab+b^{2})'],
  ['Difference of cubes','a^{3}-b^{3}=(a-b)(a^{2}+ab+b^{2})'],
  ['Slope','m=\\frac{y_{2}-y_{1}}{x_{2}-x_{1}}'],
  ['Point-slope form','y-y_{1}=m(x-x_{1})'],
  ['Distance formula','d=\\sqrt{(x_{2}-x_{1})^{2}+(y_{2}-y_{1})^{2}}'],
  ['Midpoint','M=\\left(\\frac{x_{1}+x_{2}}{2},\\frac{y_{1}+y_{2}}{2}\\right)'],
  ['Absolute value','|x|=\\begin{cases}x&x\\ge 0\\\\-x&x<0\\end{cases}'],
  ['Exponents: product','a^{m}\\cdot a^{n}=a^{m+n}'],
  ['Exponents: quotient','\\frac{a^{m}}{a^{n}}=a^{m-n}'],
  ['Exponents: power','(a^{m})^{n}=a^{mn}'],
  ['Logs: product','\\log_{a}(xy)=\\log_{a}x+\\log_{a}y'],
  ['Logs: quotient','\\log_{a}\\frac{x}{y}=\\log_{a}x-\\log_{a}y'],
  ['Logs: power','\\log_{a}x^{n}=n\\log_{a}x'],
  ['Change of base','\\log_{b}a=\\frac{\\ln a}{\\ln b}'],
  ['Arithmetic: nth term','a_{n}=a_{1}+(n-1)d'],
  ['Arithmetic: sum','S_{n}=\\frac{n}{2}(a_{1}+a_{n})'],
  ['Geometric: nth term','a_{n}=a_{1}r^{n-1}'],
  ['Geometric: sum','S_{n}=a_{1}\\frac{1-r^{n}}{1-r}'],
  ['Geometric: infinite sum','S=\\frac{a_{1}}{1-r},\\quad |r|<1'],
  ['Compound interest','A=P\\left(1+\\frac{r}{n}\\right)^{nt}']]),
 G('Geometry',[
  ['Circumference','C=2\\pi r'],
  ['Arc length','s=r\\theta'],
  ['Sector area','A=\\frac{1}{2}r^{2}\\theta'],
  ['Circle equation','(x-h)^{2}+(y-k)^{2}=r^{2}'],
  ['Triangle area','A=\\frac{1}{2}bh'],
  ["Heron's formula",'A=\\sqrt{s(s-a)(s-b)(s-c)}'],
  ['Trapezoid area','A=\\frac{1}{2}(a+b)h'],
  ['Law of Sines','\\frac{a}{\\sin A}=\\frac{b}{\\sin B}=\\frac{c}{\\sin C}'],
  ['Cylinder volume','V=\\pi r^{2}h'],
  ['Cylinder surface area','S=2\\pi r(r+h)'],
  ['Cone volume','V=\\frac{1}{3}\\pi r^{2}h'],
  ['Sphere volume','V=\\frac{4}{3}\\pi r^{3}'],
  ['Sphere surface area','S=4\\pi r^{2}']]),
 G('Trigonometry',[
  ['Pythagorean identity','\\sin^{2}\\theta+\\cos^{2}\\theta=1'],
  ['Tangent identity','1+\\tan^{2}\\theta=\\sec^{2}\\theta'],
  ['Cotangent identity','1+\\cot^{2}\\theta=\\csc^{2}\\theta'],
  ['Tangent as a ratio','\\tan\\theta=\\frac{\\sin\\theta}{\\cos\\theta}'],
  ['Double angle: sine','\\sin 2\\theta=2\\sin\\theta\\cos\\theta'],
  ['Double angle: cosine','\\cos 2\\theta=\\cos^{2}\\theta-\\sin^{2}\\theta'],
  ['Double angle: tangent','\\tan 2\\theta=\\frac{2\\tan\\theta}{1-\\tan^{2}\\theta}'],
  ['Sum: sine','\\sin(\\alpha\\pm\\beta)=\\sin\\alpha\\cos\\beta\\pm\\cos\\alpha\\sin\\beta'],
  ['Sum: cosine','\\cos(\\alpha\\pm\\beta)=\\cos\\alpha\\cos\\beta\\mp\\sin\\alpha\\sin\\beta'],
  ['Half angle: sine','\\sin^{2}\\frac{\\theta}{2}=\\frac{1-\\cos\\theta}{2}'],
  ['Half angle: cosine','\\cos^{2}\\frac{\\theta}{2}=\\frac{1+\\cos\\theta}{2}'],
  ["Euler's formula",'e^{i\\theta}=\\cos\\theta+i\\sin\\theta'],
  ["De Moivre's theorem",'(\\cos\\theta+i\\sin\\theta)^{n}=\\cos n\\theta+i\\sin n\\theta'],
  ["Euler's identity",'e^{i\\pi}+1=0']]),
 G('Calculus',[
  ['Definition of derivative','f\'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}'],
  ['Power rule','\\frac{d}{dx}x^{n}=nx^{n-1}'],
  ['Product rule','(fg)\'=f\'g+fg\''],
  ['Quotient rule','\\left(\\frac{f}{g}\\right)\'=\\frac{f\'g-fg\'}{g^{2}}'],
  ['Chain rule','\\frac{dy}{dx}=\\frac{dy}{du}\\cdot\\frac{du}{dx}'],
  ['Derivative of sin','\\frac{d}{dx}\\sin x=\\cos x'],
  ['Derivative of e^x','\\frac{d}{dx}e^{x}=e^{x}'],
  ['Derivative of ln','\\frac{d}{dx}\\ln x=\\frac{1}{x}'],
  ['Fundamental theorem','\\int_{a}^{b}f(x)\\,dx=F(b)-F(a)'],
  ['Integration by parts','\\int u\\,dv=uv-\\int v\\,du'],
  ["L'Hôpital's rule",'\\lim_{x\\to a}\\frac{f(x)}{g(x)}=\\lim_{x\\to a}\\frac{f\'(x)}{g\'(x)}'],
  ['Taylor series','f(x)=\\sum_{n=0}^{\\infty}\\frac{f^{(n)}(a)}{n!}(x-a)^{n}'],
  ['Maclaurin: e^x','e^{x}=\\sum_{n=0}^{\\infty}\\frac{x^{n}}{n!}'],
  ['Maclaurin: sin','\\sin x=\\sum_{n=0}^{\\infty}\\frac{(-1)^{n}x^{2n+1}}{(2n+1)!}'],
  ['Maclaurin: cos','\\cos x=\\sum_{n=0}^{\\infty}\\frac{(-1)^{n}x^{2n}}{(2n)!}'],
  ['Gaussian integral','\\int_{-\\infty}^{\\infty}e^{-x^{2}}\\,dx=\\sqrt{\\pi}'],
  ['Gradient','\\nabla f=\\left(\\frac{\\partial f}{\\partial x},\\frac{\\partial f}{\\partial y},\\frac{\\partial f}{\\partial z}\\right)'],
  ['Divergence','\\nabla\\cdot\\mathbf{F}=\\frac{\\partial F_{x}}{\\partial x}+\\frac{\\partial F_{y}}{\\partial y}+\\frac{\\partial F_{z}}{\\partial z}'],
  ['Laplacian','\\nabla^{2}f=\\frac{\\partial^{2}f}{\\partial x^{2}}+\\frac{\\partial^{2}f}{\\partial y^{2}}'],
  ["Green's theorem",'\\oint_{C}(L\\,dx+M\\,dy)=\\iint_{D}\\left(\\frac{\\partial M}{\\partial x}-\\frac{\\partial L}{\\partial y}\\right)dA'],
  ['Laplace transform','\\mathcal{L}\\{f(t)\\}=\\int_{0}^{\\infty}e^{-st}f(t)\\,dt'],
  ['Fourier transform','\\hat{f}(\\xi)=\\int_{-\\infty}^{\\infty}f(x)e^{-2\\pi ix\\xi}\\,dx'],
  ['First-order linear ODE','\\frac{dy}{dx}+P(x)y=Q(x)'],
  ['Second-order linear ODE','a\\frac{d^{2}y}{dx^{2}}+b\\frac{dy}{dx}+cy=0']]),
 G('Linear Algebra',[
  ['Determinant 2×2','\\det\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}=ad-bc'],
  ['Inverse 2×2','A^{-1}=\\frac{1}{ad-bc}\\begin{pmatrix}d&-b\\\\-c&a\\end{pmatrix}'],
  ['Eigenvalue equation','A\\mathbf{v}=\\lambda\\mathbf{v}'],
  ['Characteristic equation','\\det(A-\\lambda I)=0'],
  ['Dot product','\\mathbf{a}\\cdot\\mathbf{b}=|\\mathbf{a}||\\mathbf{b}|\\cos\\theta'],
  ['Cross product magnitude','|\\mathbf{a}\\times\\mathbf{b}|=|\\mathbf{a}||\\mathbf{b}|\\sin\\theta'],
  ['Vector norm','\\|\\mathbf{v}\\|=\\sqrt{v_{1}^{2}+v_{2}^{2}+\\cdots+v_{n}^{2}}'],
  ['Linear system','\\left\\{\\begin{array}{l}a_{1}x+b_{1}y=c_{1}\\\\a_{2}x+b_{2}y=c_{2}\\end{array}\\right.'],
  ["Cramer's rule",'x=\\frac{\\det A_{x}}{\\det A}'],
  ['Matrix product','(AB)_{ij}=\\sum_{k=1}^{n}a_{ik}b_{kj}'],
  ['Rank-nullity theorem','\\dim V=\\operatorname{rank}(T)+\\operatorname{nullity}(T)']]),
 G('Probability and Statistics',[
  ['Mean','\\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_{i}'],
  ['Variance','\\sigma^{2}=\\frac{1}{n}\\sum_{i=1}^{n}(x_{i}-\\mu)^{2}'],
  ['Standard deviation','\\sigma=\\sqrt{\\frac{1}{n}\\sum_{i=1}^{n}(x_{i}-\\mu)^{2}}'],
  ['Z-score','z=\\frac{x-\\mu}{\\sigma}'],
  ['Normal distribution','f(x)=\\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{(x-\\mu)^{2}}{2\\sigma^{2}}}'],
  ['Expected value','E[X]=\\sum_{i}x_{i}\\,p(x_{i})'],
  ["Bayes' theorem",'P(A|B)=\\frac{P(B|A)\\,P(A)}{P(B)}'],
  ['Binomial distribution','P(X=k)=\\binom{n}{k}p^{k}(1-p)^{n-k}'],
  ['Permutations','{}^{n}P_{r}=\\frac{n!}{(n-r)!}'],
  ['Combinations','\\binom{n}{r}=\\frac{n!}{r!(n-r)!}'],
  ['Correlation','r=\\frac{\\sum(x_{i}-\\bar{x})(y_{i}-\\bar{y})}{\\sqrt{\\sum(x_{i}-\\bar{x})^{2}\\sum(y_{i}-\\bar{y})^{2}}}']]),
 G('Physics',[
  ["Newton's second law",'F=ma'],
  ['Momentum','p=mv'],
  ['Kinetic energy','E_{k}=\\frac{1}{2}mv^{2}'],
  ['Potential energy','U=mgh'],
  ['Work','W=Fd\\cos\\theta'],
  ['Mass-energy equivalence','E=mc^{2}'],
  ["Ohm's law",'V=IR'],
  ['Electric power','P=VI'],
  ["Newton's gravitation",'F=G\\frac{m_{1}m_{2}}{r^{2}}'],
  ["Coulomb's law",'F=k\\frac{q_{1}q_{2}}{r^{2}}'],
  ['Kinematics: velocity','v=u+at'],
  ['Kinematics: displacement','s=ut+\\frac{1}{2}at^{2}'],
  ['Kinematics: v squared','v^{2}=u^{2}+2as'],
  ['Centripetal acceleration','a_{c}=\\frac{v^{2}}{r}'],
  ['Pendulum period','T=2\\pi\\sqrt{\\frac{l}{g}}'],
  ['Wave speed','v=f\\lambda'],
  ['Photon energy','E=hf'],
  ['de Broglie wavelength','\\lambda=\\frac{h}{p}'],
  ['Ideal gas law','PV=nRT'],
  ['Schrödinger equation','i\\hbar\\frac{\\partial}{\\partial t}\\Psi=\\hat{H}\\Psi']]),
 G('Sets, Logic and Number Theory',[
  ['De Morgan (union)','\\overline{A\\cup B}=\\overline{A}\\cap\\overline{B}'],
  ['De Morgan (intersection)','\\overline{A\\cap B}=\\overline{A}\\cup\\overline{B}'],
  ['Inclusion-exclusion','|A\\cup B|=|A|+|B|-|A\\cap B|'],
  ['De Morgan (logic)','\\neg(p\\land q)\\equiv\\neg p\\lor\\neg q'],
  ['Epsilon-delta limit','\\forall\\varepsilon>0\\,\\exists\\delta>0:\\;|x-a|<\\delta\\Rightarrow|f(x)-f(a)|<\\varepsilon'],
  ['Congruence','a\\equiv b\\pmod{n}'],
  ["Fermat's little theorem",'a^{p-1}\\equiv1\\pmod{p}'],
  ['Division algorithm','a=bq+r,\\quad 0\\le r<b']])
];

/* ---- Symbols: [character shown, LaTeX]. An empty character is drawn with MathLive (script letters). ---- */
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const alpha = cmd => AZ.map(c => ['', `\\${cmd}{${c}}`]);
const SYM = {
 "Basic Math":[["±","\\pm"],["∓","\\mp"],["×","\\times"],["÷","\\div"],["⋅","\\cdot"],["∗","\\ast"],["=","="],["≠","\\ne"],["≈","\\approx"],["≡","\\equiv"],["∼","\\sim"],["≅","\\cong"],["∝","\\propto"],["<","<"],[">",">"],["≤","\\le"],["≥","\\ge"],["≪","\\ll"],["≫","\\gg"],["∞","\\infty"],["!","!"],["%","\\%"],["°","^\\circ"],["′","^{\\prime}"],["″","^{\\prime\\prime}"],["∂","\\partial"],["∇","\\nabla"],["Δ","\\Delta"],["√","\\sqrt{#?}"],["∛","\\sqrt[3]{#?}"],["∜","\\sqrt[4]{#?}"],["∑","\\sum"],["∏","\\prod"],["∫","\\int"],["∀","\\forall"],["∃","\\exists"],["∄","\\nexists"],["∁","\\complement"],["∴","\\therefore"],["∵","\\because"],["¬","\\neg"],["+","+"],["−","-"],["∅","\\emptyset"],["∈","\\in"],["∋","\\ni"],["∪","\\cup"],["∩","\\cap"],["←","\\leftarrow"],["→","\\rightarrow"],["↑","\\uparrow"],["↓","\\downarrow"],["↔","\\leftrightarrow"],["℃","^\\circ\\mathrm{C}"],["℉","^\\circ\\mathrm{F}"],["∣","\\mid"],["∥","\\parallel"]],
 Greek:[["α","\\alpha"],["β","\\beta"],["γ","\\gamma"],["δ","\\delta"],["ε","\\varepsilon"],["ϵ","\\epsilon"],["ζ","\\zeta"],["η","\\eta"],["θ","\\theta"],["ϑ","\\vartheta"],["ι","\\iota"],["κ","\\kappa"],["ϰ","\\varkappa"],["λ","\\lambda"],["μ","\\mu"],["ν","\\nu"],["ξ","\\xi"],["π","\\pi"],["ϖ","\\varpi"],["ρ","\\rho"],["ϱ","\\varrho"],["σ","\\sigma"],["ς","\\varsigma"],["τ","\\tau"],["υ","\\upsilon"],["φ","\\varphi"],["ϕ","\\phi"],["χ","\\chi"],["ψ","\\psi"],["ω","\\omega"],["Γ","\\Gamma"],["Δ","\\Delta"],["Θ","\\Theta"],["Λ","\\Lambda"],["Ξ","\\Xi"],["Π","\\Pi"],["Σ","\\Sigma"],["Υ","\\Upsilon"],["Φ","\\Phi"],["Ψ","\\Psi"],["Ω","\\Omega"],["ϝ","\\digamma"]],
 "Letter-like":[["ℵ","\\aleph"],["ℶ","\\beth"],["ℷ","\\gimel"],["ℸ","\\daleth"],["ℏ","\\hbar"],["ℓ","\\ell"],["℘","\\wp"],["ℜ","\\Re"],["ℑ","\\Im"],["ℕ","\\mathbb{N}"],["ℤ","\\mathbb{Z}"],["ℚ","\\mathbb{Q}"],["ℝ","\\mathbb{R}"],["ℂ","\\mathbb{C}"],["ℍ","\\mathbb{H}"],["ℙ","\\mathbb{P}"],["𝔼","\\mathbb{E}"],["∞","\\infty"],["∅","\\emptyset"],["℧","\\mho"],["ı","\\imath"],["ȷ","\\jmath"]],
 Operators:[["+","+"],["−","-"],["±","\\pm"],["∓","\\mp"],["×","\\times"],["÷","\\div"],["⋅","\\cdot"],["∗","\\ast"],["⋆","\\star"],["∘","\\circ"],["∙","\\bullet"],["⊕","\\oplus"],["⊖","\\ominus"],["⊗","\\otimes"],["⊘","\\oslash"],["⊙","\\odot"],["∧","\\land"],["∨","\\lor"],["⊻","\\veebar"],["∐","\\coprod"],["⋂","\\bigcap"],["⋃","\\bigcup"],["⋁","\\bigvee"],["⋀","\\bigwedge"],["⨁","\\bigoplus"],["⨂","\\bigotimes"],["⨀","\\bigodot"],["∮","\\oint"],["∬","\\iint"],["∭","\\iiint"],["∖","\\setminus"],["⊎","\\uplus"],["⊔","\\sqcup"],["⊓","\\sqcap"],["†","\\dagger"],["‡","\\ddagger"],["⋄","\\diamond"],["≀","\\wr"],["⨿","\\amalg"]],
 Arrows:[["←","\\leftarrow"],["→","\\rightarrow"],["↑","\\uparrow"],["↓","\\downarrow"],["↔","\\leftrightarrow"],["↕","\\updownarrow"],["⇐","\\Leftarrow"],["⇒","\\Rightarrow"],["⇑","\\Uparrow"],["⇓","\\Downarrow"],["⇔","\\Leftrightarrow"],["⇕","\\Updownarrow"],["⟵","\\longleftarrow"],["⟶","\\longrightarrow"],["⟷","\\longleftrightarrow"],["⟸","\\Longleftarrow"],["⟹","\\Longrightarrow"],["⟺","\\Longleftrightarrow"],["↦","\\mapsto"],["⟼","\\longmapsto"],["↩","\\hookleftarrow"],["↪","\\hookrightarrow"],["↼","\\leftharpoonup"],["⇀","\\rightharpoonup"],["↽","\\leftharpoondown"],["⇁","\\rightharpoondown"],["⇌","\\rightleftharpoons"],["⇋","\\leftrightharpoons"],["↗","\\nearrow"],["↘","\\searrow"],["↙","\\swarrow"],["↖","\\nwarrow"],["↺","\\circlearrowleft"],["↻","\\circlearrowright"],["⇝","\\rightsquigarrow"],["↠","\\twoheadrightarrow"],["↣","\\rightarrowtail"],["⇢","\\dashrightarrow"],["⇉","\\rightrightarrows"],["⇄","\\rightleftarrows"]],
 Relations:[["=","="],["≠","\\ne"],["≈","\\approx"],["≃","\\simeq"],["≅","\\cong"],["≡","\\equiv"],["∼","\\sim"],["∝","\\propto"],["<","<"],[">",">"],["≤","\\le"],["≥","\\ge"],["≪","\\ll"],["≫","\\gg"],["≺","\\prec"],["≻","\\succ"],["⪯","\\preceq"],["⪰","\\succeq"],["≲","\\lesssim"],["≳","\\gtrsim"],["≍","\\asymp"],["≐","\\doteq"],["≜","\\triangleq"],["⊲","\\vartriangleleft"],["⊳","\\vartriangleright"],["⋈","\\bowtie"],["⌣","\\smile"],["⌢","\\frown"],["⊨","\\models"],["⊢","\\vdash"],["⊣","\\dashv"],["∣","\\mid"],["∥","\\parallel"],["⊥","\\perp"]],
 "Sets & Logic":[["∈","\\in"],["∉","\\notin"],["∋","\\ni"],["⊂","\\subset"],["⊃","\\supset"],["⊆","\\subseteq"],["⊇","\\supseteq"],["⊊","\\subsetneq"],["⊋","\\supsetneq"],["⊏","\\sqsubset"],["⊑","\\sqsubseteq"],["∪","\\cup"],["∩","\\cap"],["∅","\\emptyset"],["∖","\\setminus"],["∧","\\land"],["∨","\\lor"],["¬","\\neg"],["∀","\\forall"],["∃","\\exists"],["∄","\\nexists"],["∴","\\therefore"],["∵","\\because"],["⊢","\\vdash"],["⊣","\\dashv"],["⊨","\\models"],["⊤","\\top"],["⊥","\\bot"],["∣","\\mid"],["∤","\\nmid"],["⇒","\\Rightarrow"],["⇔","\\Leftrightarrow"]],
 Negated:[["≠","\\ne"],["≁","\\nsim"],["≇","\\ncong"],["≉","\\not\\approx"],["≢","\\not\\equiv"],["≮","\\nless"],["≯","\\ngtr"],["≰","\\nleq"],["≱","\\ngeq"],["⊀","\\nprec"],["⊁","\\nsucc"],["⊄","\\not\\subset"],["⊅","\\not\\supset"],["⊈","\\nsubseteq"],["⊉","\\nsupseteq"],["∉","\\notin"],["∤","\\nmid"],["∦","\\nparallel"],["⊬","\\nvdash"],["⊭","\\nvDash"]],
 Geometry:[["∠","\\angle"],["∡","\\measuredangle"],["∢","\\sphericalangle"],["⊥","\\perp"],["∥","\\parallel"],["△","\\triangle"],["▽","\\triangledown"],["□","\\square"],["■","\\blacksquare"],["◊","\\lozenge"],["⋄","\\diamond"],["○","\\bigcirc"],["∘","\\circ"],["≅","\\cong"],["∼","\\sim"],["°","^\\circ"],["′","^{\\prime}"],["″","^{\\prime\\prime}"],["↗","\\nearrow"],["→","\\rightarrow"]],
 Scripts:[...alpha('mathcal'), ...alpha('mathbb'), ...alpha('mathfrak')],
 Delimiters:[["(","("],[")",")"],["[","["],["]","]"],["{","\\lbrace"],["}","\\rbrace"],["⟨","\\langle"],["⟩","\\rangle"],["⌊","\\lfloor"],["⌋","\\rfloor"],["⌈","\\lceil"],["⌉","\\rceil"],["|","\\vert"],["‖","\\Vert"],["⟦","\\llbracket"],["⟧","\\rrbracket"]],
 Misc:[["⋯","\\cdots"],["…","\\ldots"],["⋮","\\vdots"],["⋱","\\ddots"],["∎","\\blacksquare"],["□","\\square"],["†","\\dagger"],["‡","\\ddagger"],["§","\\S"],["ℏ","\\hbar"],["ℓ","\\ell"],["∂","\\partial"],["∇","\\nabla"],["♭","\\flat"],["♮","\\natural"],["♯","\\sharp"],["♠","\\spadesuit"],["♣","\\clubsuit"],["♡","\\heartsuit"],["♢","\\diamondsuit"],["∠","\\angle"],["√","\\surd"],["′","^{\\prime}"]]
};