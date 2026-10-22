# 📁 FILE: D:\EquationTool\solver_engine.py
"""Equation Studio solver: LaTeX -> SymPy -> step-by-step solution.

Runs inside a separate worker process (see SolverClient in studio_app.py), so a hard problem can never
freeze the editor. SymPy is imported lazily: the main app starts fast and only the worker pays for it.
"""
from __future__ import annotations

import re

MAX_LATEX = 2000
MAX_STEPS = 40


class ParseError(Exception):
    """The LaTeX could not be understood (the message is shown to the user)."""


class Unsupported(Exception):
    """Understood, but this kind of problem is not supported yet."""


# ===================================================================== worker
def worker_main(conn) -> None:
    try:
        import sympy  # noqa: F401  (warm-up: the first import takes a second or two)
    except Exception:  # noqa: BLE001
        pass
    while True:
        try:
            req = conn.recv()
        except (EOFError, OSError):
            break
        if req is None:
            break
        try:
            res = solve_request(req)
        except BaseException as e:  # noqa: BLE001  (the worker must never die silently)
            rid = req.get("id") if isinstance(req, dict) else None
            res = {"id": rid, "ok": False, "error": "Unexpected solver error.", "hint": str(e)[:160]}
        try:
            conn.send(res)
        except (OSError, ValueError):
            break


def solve_request(req: dict) -> dict:
    rid = req.get("id")
    try:
        latex = str(req.get("latex") or "").strip()
        if not latex:
            raise ParseError("The equation is empty.")
        if len(latex) > MAX_LATEX:
            raise ParseError("The equation is too long.")
        if "\\placeholder" in latex:
            raise ParseError("Fill in the empty boxes first.")
        import sympy as sp

        ctx = Ctx(sp)
        if re.search(r"\\log(?!_)", latex):
            ctx.notes.append("log means base 10 here. Use ln for the natural logarithm.")
        parsed = parse_latex(latex, ctx)
        result = dispatch(parsed, ctx, req.get("var"))
        result["id"] = rid
        result["ok"] = True
        return result
    except ParseError as e:
        return {"id": rid, "ok": False, "error": str(e), "hint": "Check the equation and try again."}
    except Unsupported as e:
        return {"id": rid, "ok": False, "error": str(e),
                "hint": "Supported: integrals, derivatives, limits, sums, equations, systems, inequalities, expressions."}
    except RecursionError:
        return {"id": rid, "ok": False, "error": "This expression is too deeply nested.", "hint": "Try a simpler form."}
    except ImportError:
        return {"id": rid, "ok": False, "error": "The solver library is missing.", "hint": "Install it with: pip install sympy"}
    except Exception as e:  # noqa: BLE001
        return {"id": rid, "ok": False, "error": "Could not solve this one.", "hint": (type(e).__name__ + ": " + str(e))[:140]}


# ===================================================================== context
class Ctx:
    def __init__(self, sp) -> None:
        self.sp = sp
        self.steps: list[dict] = []
        self.notes: list[str] = []

    def tex(self, e) -> str:
        sp = self.sp
        try:  # SymPy's internal dummy symbols (from substitution) are shown as plain u
            if hasattr(e, "free_symbols"):
                dummies = {d: sp.Symbol("u") for d in e.free_symbols if isinstance(d, sp.Dummy)}
                if dummies:
                    e = e.xreplace(dummies)
        except Exception:  # noqa: BLE001
            pass
        try:
            return sp.latex(e, ln_notation=True, inv_trig_style="full")
        except TypeError:
            return sp.latex(e)

    def add(self, title: str, latex: str = "", note: str = "") -> None:
        if len(self.steps) < MAX_STEPS:
            self.steps.append({"title": title, "latex": latex, "note": note})


def finish(ctx, kind, title, answer, decimal="", variable="", vars_=None) -> dict:
    return {"kind": kind, "title": title, "steps": ctx.steps, "answer": answer, "decimal": decimal,
            "notes": ctx.notes, "variable": variable, "vars": vars_ or []}


def decimal_text(sp, val) -> str:
    try:
        if getattr(val, "free_symbols", None):
            return ""
        if val.is_Integer or val.is_infinite:
            return ""
        c = complex(sp.N(val, 15))
        if abs(c.imag) > 1e-12:
            return ""
        return "%.10g" % c.real
    except Exception:  # noqa: BLE001
        return ""


# ===================================================================== LaTeX parser
_GREEK = {"alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta", "iota",
          "kappa", "lambda", "mu", "nu", "xi", "rho", "sigma", "tau", "upsilon", "phi", "varphi", "chi", "psi",
          "omega", "Gamma", "Delta", "Theta", "Lambda", "Xi", "Sigma", "Phi", "Psi", "Omega"}
_FUNCS = {"sin": "sin", "cos": "cos", "tan": "tan", "cot": "cot", "sec": "sec", "csc": "csc",
          "arcsin": "asin", "arccos": "acos", "arctan": "atan", "sinh": "sinh", "cosh": "cosh", "tanh": "tanh",
          "coth": "coth", "exp": "exp", "ln": "ln", "log": "log", "lg": "lg"}
_INVERSE = {"sin": "asin", "cos": "acos", "tan": "atan", "sinh": "asinh", "cosh": "acosh", "tanh": "atanh"}
_SKIP = {"\\,", "\\;", "\\:", "\\!", "\\ ", "\\quad", "\\qquad", "\\displaystyle", "\\textstyle", "\\limits", "\\nolimits"}
_REL = {"=", "<", ">", "\\le", "\\leq", "\\ge", "\\geq", "\\ne", "\\neq"}
_NUM_RE = re.compile(r"\d+(?:\.\d+)?")
_TOKEN_RE = re.compile(r"\s+|(\\[A-Za-z]+|\\.)|(\d+(?:\.\d+)?)|(.)", re.S)
_ATOM_CMDS = {"\\" + n for n in (set(_GREEK) | set(_FUNCS) | {"pi", "infty", "frac", "sqrt", "left", "int", "sum",
                                                               "prod", "lim", "binom", "begin"})}
_SIMPLE_CMDS = {"\\" + n for n in (set(_GREEK) | {"pi", "infty", "frac", "sqrt"})}
_ENV_RE = re.compile(r"\\begin\{(cases|array|aligned|align\*?|gathered|split)\}(\{[^}]*\})?(.*?)\\end\{\1\}", re.S)


def normalize(src: str) -> str:
    s = re.sub(r"\\(?:mathrm|operatorname|mathit|text)\{([A-Za-z])\}", r"\1", src)
    s = re.sub(r"\\(?:dfrac|tfrac|cfrac)", r"\\frac", s)
    s = s.replace("\\lvert", "|").replace("\\rvert", "|")
    s = s.replace("\\left.", "").replace("\\right.", "")
    return s


def tokenize(src: str) -> list[str]:
    out = []
    for m in _TOKEN_RE.finditer(src):
        if m.group(1) is None and m.group(2) is None and m.group(3) is None:
            continue  # whitespace
        tok = m.group(0)
        if tok in _SKIP:
            continue
        out.append(tok)
    return out


def split_top(tokens, sep):
    parts, cur, depth = [], [], 0
    for tk in tokens:
        if tk == "{":
            depth += 1
        elif tk == "}":
            depth -= 1
        if tk == sep and depth == 0:
            parts.append(cur)
            cur = []
        else:
            cur.append(tk)
    parts.append(cur)
    return parts


class DerivOp:
    def __init__(self, order, var) -> None:
        self.order = order
        self.var = var


class LatexParser:
    def __init__(self, tokens, sp) -> None:
        self.t = list(tokens)
        self.i = 0
        self.sp = sp
        self.abs_depth = 0

    # ---- helpers
    def peek(self, k=0):
        j = self.i + k
        return self.t[j] if j < len(self.t) else None

    def next(self):
        tok = self.peek()
        if tok is not None:
            self.i += 1
        return tok

    def expect(self, tok):
        if self.peek() != tok:
            raise ParseError("I expected '" + tok + "' here.")
        self.i += 1

    def at_end(self):
        return self.i >= len(self.t)

    def sub(self, tokens):
        p = LatexParser(tokens, self.sp)
        node = p.parse_expr()
        if not p.at_end():
            raise ParseError("I could not read '" + p.t[p.i] + "'.")
        return node

    def read_braced(self):
        if self.peek() != "{":
            raise ParseError("I expected '{' here.")
        self.i += 1
        depth, out = 1, []
        while self.i < len(self.t):
            tk = self.t[self.i]
            self.i += 1
            if tk == "{":
                depth += 1
            elif tk == "}":
                depth -= 1
                if depth == 0:
                    return out
            out.append(tk)
        raise ParseError("A closing brace is missing.")

    def arg_tokens(self):
        if self.peek() == "{":
            return self.read_braced()
        tok = self.next()
        if tok is None:
            raise ParseError("An argument is missing.")
        if tok.isdigit() and len(tok) > 1:  # \frac12 means 1 over 2
            self.t.insert(self.i, tok[1:])
            return [tok[0]]
        return [tok]

    def take_arg(self):
        return self.sub(self.arg_tokens())

    def var_symbol(self, tok):
        return self.sp.Symbol(tok[1:] if tok.startswith("\\") else tok)

    @staticmethod
    def is_var_token(tok):
        return tok is not None and ((len(tok) == 1 and tok.isalpha()) or (tok.startswith("\\") and tok[1:] in _GREEK))

    def starts_atom(self, tok):
        if tok is None:
            return False
        if tok in ("(", "[", "{"):
            return True
        if tok == "|":
            return self.abs_depth == 0
        if _NUM_RE.fullmatch(tok):
            return True
        if len(tok) == 1 and tok.isalpha():
            return True
        return tok in _ATOM_CMDS

    @staticmethod
    def starts_simple(tok):
        if tok is None:
            return False
        return bool(_NUM_RE.fullmatch(tok)) or (len(tok) == 1 and tok.isalpha()) or tok in _SIMPLE_CMDS

    # ---- grammar
    def parse_relation(self):
        sp = self.sp
        left = self.parse_expr()
        tok = self.peek()
        if tok in _REL:
            self.i += 1
            right = self.parse_expr()
            if tok == "=":
                return sp.Eq(left, right, evaluate=False)
            if tok == "<":
                return sp.Lt(left, right, evaluate=False)
            if tok == ">":
                return sp.Gt(left, right, evaluate=False)
            if tok in ("\\le", "\\leq"):
                return sp.Le(left, right, evaluate=False)
            if tok in ("\\ge", "\\geq"):
                return sp.Ge(left, right, evaluate=False)
            return sp.Ne(left, right, evaluate=False)
        return left

    def parse_expr(self):
        node = self.parse_term()
        while self.peek() in ("+", "-"):
            op = self.next()
            rhs = self.parse_term()
            node = node + rhs if op == "+" else node - rhs
        return node

    def parse_term(self):
        node = self.parse_unary()
        while True:
            tok = self.peek()
            if tok in ("*", "\\cdot", "\\times"):
                self.i += 1
                node = node * self.parse_unary()
            elif tok in ("/", "\\div"):
                self.i += 1
                node = node / self.parse_unary()
            elif self.starts_atom(tok):
                node = node * self.parse_unary()  # implicit multiplication
            else:
                break
        return node

    def parse_unary(self):
        tok = self.peek()
        if tok == "-":
            self.i += 1
            return -self.parse_unary()
        if tok == "+":
            self.i += 1
            return self.parse_unary()
        node = self.parse_power()
        if isinstance(node, DerivOp):  # d/dx applies to the term that follows
            operand = self.parse_term()
            return self.sp.Derivative(operand, (node.var, node.order))
        return node

    def script_value(self):
        toks = self.arg_tokens()
        if toks == ["\\circ"]:
            return "DEG"
        return self.sub(toks)

    def parse_power(self):
        base = self.parse_postfix()
        if isinstance(base, DerivOp):
            return base
        if self.peek() == "^":
            self.i += 1
            exp = self.script_value()
            if isinstance(exp, str):
                return base * self.sp.pi / 180  # degrees
            base = base ** exp
        return base

    def parse_postfix(self):
        node = self.parse_atom()
        while self.peek() == "!" and not isinstance(node, DerivOp):
            self.i += 1
            node = self.sp.factorial(node)
        return node

    def parse_atom(self):
        sp = self.sp
        tok = self.next()
        if tok is None:
            raise ParseError("The expression ends too early.")
        if _NUM_RE.fullmatch(tok):
            return sp.Integer(tok) if tok.isdigit() else sp.Rational(tok)
        if tok in ("(", "["):
            inner = self.parse_expr()
            if self.peek() == ",":
                raise ParseError("Lists and intervals are not supported here.")
            self.expect(")" if tok == "(" else "]")
            return inner
        if tok == "{":
            self.i -= 1
            return self.sub(self.read_braced())
        if tok == "|":
            self.abs_depth += 1
            inner = self.parse_expr()
            self.abs_depth -= 1
            self.expect("|")
            return sp.Abs(inner)
        if tok == "\\left":
            return self.parse_left()
        if len(tok) == 1 and tok.isalpha():
            return self.parse_symbol(tok)
        if tok.startswith("\\"):
            return self.parse_command(tok)
        raise ParseError("I can't read '" + tok + "'.")

    def parse_left(self):
        sp = self.sp
        d = self.next()
        if d in ("(", "[", "\\{"):
            inner = self.parse_expr()
            self.expect("\\right")
            self.next()
            return inner
        if d in ("|", "\\|"):
            self.abs_depth += 1
            inner = self.parse_expr()
            self.abs_depth -= 1
            self.expect("\\right")
            self.next()
            return sp.Abs(inner)
        raise ParseError("This kind of bracket is not supported.")

    def parse_symbol(self, name):
        sp = self.sp
        if self.peek() == "_":
            self.i += 1
            return sp.Symbol(name + "_" + "".join(self.arg_tokens()))
        if name == "e":
            return sp.E
        if name in ("f", "g") and self.peek() == "(":
            self.i += 1
            arg = self.parse_expr()
            self.expect(")")
            return sp.Function(name)(arg)
        return sp.Symbol(name)

    def parse_command(self, tok):
        sp = self.sp
        name = tok[1:]
        if name == "pi":
            return sp.pi
        if name == "infty":
            return sp.oo
        if name in _GREEK:
            sym = name
            if self.peek() == "_":
                self.i += 1
                sym = name + "_" + "".join(self.arg_tokens())
            return sp.Symbol(sym)
        if name == "frac":
            return self.parse_frac()
        if name == "sqrt":
            idx = None
            if self.peek() == "[":
                self.i += 1
                toks = []
                while self.peek() not in ("]", None):
                    toks.append(self.next())
                self.expect("]")
                idx = self.sub(toks)
            arg = self.take_arg()
            return sp.sqrt(arg) if idx is None else sp.root(arg, idx)
        if name == "binom":
            n = self.take_arg()
            k = self.take_arg()
            return sp.binomial(n, k)
        if name in _FUNCS:
            return self.parse_function(name)
        if name == "int":
            return self.parse_integral()
        if name in ("sum", "prod"):
            return self.parse_bigop(name)
        if name == "lim":
            return self.parse_limit()
        if name == "begin":
            return self.parse_matrix()
        raise ParseError("'" + tok + "' is not supported in calculations yet.")

    def parse_func_arg(self):
        if self.peek() in ("(", "[", "\\left", "|", "{"):
            return self.parse_atom()
        node = self.parse_power()
        while self.starts_simple(self.peek()):
            node = node * self.parse_power()
        return node

    def parse_function(self, name):
        sp = self.sp
        power, inverse, base = None, False, None
        for _ in range(2):
            if self.peek() == "^":
                self.i += 1
                v = self.script_value()
                if (not isinstance(v, str)) and v == -1 and name in _INVERSE:
                    inverse = True
                else:
                    power = v
            elif self.peek() == "_" and name == "log":
                self.i += 1
                base = self.take_arg()
        arg = self.parse_func_arg()
        fname = _INVERSE[name] if inverse else _FUNCS[name]
        if fname == "ln":
            val = sp.log(arg)
        elif fname == "log":
            val = sp.log(arg, base if base is not None else 10)
        elif fname == "lg":
            val = sp.log(arg, 10)
        else:
            val = getattr(sp, fname)(arg)
        return val ** power if (power is not None and not isinstance(power, str)) else val

    def derivative_op(self, num, den):
        n = [x for x in num if x not in ("{", "}")]
        d = [x for x in den if x not in ("{", "}")]

        def order(seq, head):
            if seq == [head]:
                return 1
            if len(seq) == 3 and seq[0] == head and seq[1] == "^" and seq[2].isdigit():
                return int(seq[2])
            return None

        for head in ("d", "\\partial"):
            o = order(n, head)
            if o is None or len(d) < 2 or d[0] != head or not self.is_var_token(d[1]):
                continue
            rest = d[2:]
            if rest and not (len(rest) == 2 and rest[0] == "^" and rest[1].isdigit()):
                continue
            return DerivOp(o, self.var_symbol(d[1]))
        return None

    def parse_frac(self):
        num = self.arg_tokens()
        den = self.arg_tokens()
        op = self.derivative_op(num, den)
        if op is not None:
            return op
        return self.sub(num) / self.sub(den)

    def find_differential(self):
        t, depth, k = self.t, 0, self.i
        while k < len(t):
            tk = t[k]
            if tk in ("{", "(", "["):
                depth += 1
            elif tk in ("}", ")", "]"):
                depth -= 1
            elif tk == "\\left":
                depth += 1
                k += 1
            elif tk == "\\right":
                depth -= 1
                k += 1
            elif depth == 0 and tk == "d" and k + 1 < len(t) and self.is_var_token(t[k + 1]):
                return k
            k += 1
        return -1

    def parse_integral(self):
        sp = self.sp
        lower = upper = None
        for _ in range(2):
            if self.peek() == "_" and lower is None:
                self.i += 1
                lower = self.take_arg()
            elif self.peek() == "^" and upper is None:
                self.i += 1
                upper = self.take_arg()
        k = self.find_differential()
        if k < 0:
            raise ParseError("I could not find the differential (like dx) in the integral.")
        body = self.t[self.i:k]
        var = self.var_symbol(self.t[k + 1])
        self.i = k + 2
        f = self.sub(body) if body else sp.Integer(1)
        if lower is None and upper is None:
            return sp.Integral(f, var)
        if lower is None or upper is None:
            raise ParseError("A definite integral needs both limits.")
        return sp.Integral(f, (var, lower, upper))

    def parse_bigop(self, name):
        sp = self.sp
        if self.peek() != "_":
            raise ParseError("A sum or product needs limits, like \\sum_{i=1}^{n}.")
        self.i += 1
        low = self.arg_tokens()
        if "=" not in low or low.index("=") != 1 or not self.is_var_token(low[0]):
            raise ParseError("The lower limit should look like i=1.")
        var = self.var_symbol(low[0])
        lower = self.sub(low[2:])
        if self.peek() != "^":
            raise ParseError("A sum or product needs an upper limit.")
        self.i += 1
        upper = self.take_arg()
        body = self.parse_term()
        return (sp.Sum if name == "sum" else sp.Product)(body, (var, lower, upper))

    def parse_limit(self):
        sp = self.sp
        if self.peek() != "_":
            raise ParseError("A limit needs a variable, like \\lim_{x\\to 0}.")
        self.i += 1
        g = self.arg_tokens()
        j = next((idx for idx, tk in enumerate(g) if tk in ("\\to", "\\rightarrow")), None)
        if j != 1 or not self.is_var_token(g[0]):
            raise ParseError("The limit should look like x \\to a.")
        var = self.var_symbol(g[0])
        target, direction = g[2:], "+-"
        if target[-2:] in (["^", "+"], ["^", "-"]):
            direction, target = target[-1], target[:-2]
        elif target[-4:] in (["^", "{", "+", "}"], ["^", "{", "-", "}"]):
            direction, target = target[-2], target[:-4]
        tgt = self.sub(target)
        body = self.parse_term()
        return sp.Limit(body, var, tgt, dir=direction)

    def parse_matrix(self):
        sp = self.sp
        env = "".join(self.read_braced())
        if env not in ("pmatrix", "bmatrix", "vmatrix", "matrix", "Bmatrix", "Vmatrix"):
            raise ParseError("'" + env + "' is not supported here.")
        start, depth, k = self.i, 1, self.i
        while k < len(self.t):
            if self.t[k] == "\\begin":
                depth += 1
            elif self.t[k] == "\\end":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        if k >= len(self.t):
            raise ParseError("The matrix is not closed (\\end is missing).")
        body = self.t[start:k]
        self.i = k + 1
        self.read_braced()
        rows = [r for r in split_top(body, "\\\\") if r]
        M = sp.Matrix([[self.sub(cell) for cell in split_top(r, "&")] for r in rows])
        return M.det() if env == "vmatrix" else M


def parse_relation_text(text: str, ctx):
    tokens = tokenize(text)
    if not tokens:
        raise ParseError("The equation is empty.")
    p = LatexParser(tokens, ctx.sp)
    node = p.parse_relation()
    if not p.at_end():
        raise ParseError("I could not read '" + p.t[p.i] + "'.")
    return node


def parse_latex(src: str, ctx):
    s = normalize(src)
    m = _ENV_RE.search(s)
    if m:
        outside = (s[:m.start()] + s[m.end():]).replace("\\left\\{", "").replace("\\right\\}", "").strip()
        if outside == "":
            rows = [r.replace("&", " ").strip() for r in re.split(r"\\\\", m.group(3)) if r.strip()]
            return [parse_relation_text(r, ctx) for r in rows]
    return parse_relation_text(s, ctx)


# ===================================================================== dispatch
def dispatch(parsed, ctx, pref):
    sp = ctx.sp
    if isinstance(parsed, list):
        return solve_system(parsed, ctx, pref)
    if isinstance(parsed, sp.Integral):
        return solve_integral(parsed, ctx)
    if isinstance(parsed, sp.Derivative):
        return solve_derivative(parsed, ctx)
    if isinstance(parsed, sp.Limit):
        return solve_limit(parsed, ctx)
    if isinstance(parsed, (sp.Sum, sp.Product)):
        return solve_bigop(parsed, ctx)
    if isinstance(parsed, sp.MatrixBase):
        return solve_matrix(parsed, ctx)
    if getattr(parsed, "is_Relational", False):
        if parsed.has(sp.Derivative, sp.Integral):
            raise Unsupported("Differential and integral equations are not supported yet.")
        if getattr(parsed, "is_Equality", False):
            return solve_equation(parsed, ctx, pref)
        return solve_inequality(parsed, ctx, pref)
    if parsed.has(sp.Integral, sp.Derivative, sp.Limit, sp.Sum, sp.Product):
        return solve_composite(parsed, ctx)
    return solve_expression(parsed, ctx)


def pick_var(syms, pref):
    names = {str(s): s for s in syms}
    if pref and pref in names:
        return names[pref]
    for n in ("x", "y", "z", "t"):
        if n in names:
            return names[n]
    return syms[0]


# ===================================================================== integrals
_RULE_TITLES = {
    "ConstantRule": "The integral of a constant is the constant times the variable",
    "PowerRule": "Use the power rule:  ∫ xⁿ dx = xⁿ⁺¹ / (n + 1)",
    "NestedPowRule": "Use the power rule",
    "ExpRule": "Use the exponential rule",
    "ReciprocalRule": "The integral of 1/x is ln|x|",
    "TrigRule": "Use a standard trigonometric integral",
    "ArctanRule": "Use the arctangent integral",
    "ArcsinRule": "Use the arcsine integral",
    "LogRule": "Use the logarithm rule",
}


def _rule_eval(sp, rule, f, v):
    ev = getattr(rule, "eval", None)
    if callable(ev):
        try:
            return ev()
        except Exception:  # noqa: BLE001
            pass
    try:
        from sympy.integrals.manualintegrate import _manualintegrate
        return _manualintegrate(rule)
    except Exception:  # noqa: BLE001
        pass
    return sp.integrate(f, v)


def rule_steps(ctx, rule, x, depth=0):
    """Walk a SymPy 'manualintegrate' rule tree, add readable steps, return the antiderivative."""
    sp, tex = ctx.sp, ctx.tex
    name = type(rule).__name__
    f = getattr(rule, "integrand", None)
    v = getattr(rule, "variable", None) or x
    if f is None or depth > 12:
        raise ValueError("unsupported rule")
    result = _rule_eval(sp, rule, f, v)
    vs = tex(v)

    def I(g, var=v):
        return "\\int " + tex(g) + "\\,d" + tex(var)

    if name == "AddRule":
        subs = list(getattr(rule, "substeps", None) or [])
        ctx.add("Integrate each term separately (sum rule)",
                I(f) + " = " + " + ".join(I(getattr(s, "integrand", 0)) for s in subs))
        for s in subs:
            rule_steps(ctx, s, v, depth + 1)
    elif name == "ConstantTimesRule":
        ctx.add("Take the constant factor out of the integral",
                I(f) + " = " + tex(rule.constant) + "\\int " + tex(rule.other) + "\\,d" + vs)
        rule_steps(ctx, rule.substep, v, depth + 1)
    elif name == "URule":
        ufunc, sub = rule.u_func, rule.substep
        du = sp.diff(ufunc, v)
        ctx.add("Use substitution", "u = " + tex(ufunc) + ",\\quad du = " + tex(du) + "\\,d" + vs)
        ctx.add("Rewrite the integral in terms of u", I(f) + " = \\int " + tex(sub.integrand) + "\\,du")
        rule_steps(ctx, sub, rule.u_var, depth + 1)
        ctx.add("Substitute u back", "= " + tex(result))
    elif name == "PartsRule":
        u, dv, second = rule.u, rule.dv, getattr(rule, "second_step", None)
        du = sp.diff(u, v)
        vv = _rule_eval(sp, rule.v_step, dv, v)
        ctx.add("Use integration by parts:  ∫ u dv = u·v − ∫ v du", "u = " + tex(u) + ",\\quad dv = " + tex(dv) + "\\,d" + vs)
        ctx.add("Find du and v", "du = " + tex(du) + "\\,d" + vs + ",\\quad v = " + tex(vv))
        if second is not None:
            ctx.add("Apply the formula", I(f) + " = " + tex(u * vv) + " - \\int " + tex(second.integrand) + "\\,d" + vs)
            rule_steps(ctx, second, v, depth + 1)
        else:
            ctx.add("Apply the formula", I(f) + " = " + tex(result))
    elif name == "CyclicPartsRule":
        ctx.add("Integrate by parts repeatedly; the original integral comes back, so solve for it",
                I(f) + " = " + tex(result))
    elif name == "RewriteRule":
        ctx.add("Rewrite the integrand in a simpler form", I(f) + " = \\int " + tex(rule.rewritten) + "\\,d" + vs)
        rule_steps(ctx, rule.substep, v, depth + 1)
    elif name == "AlternativeRule":
        rule_steps(ctx, rule.alternatives[0], v, depth + 1)
    else:
        ctx.add(_RULE_TITLES.get(name, "Apply a standard integral"), I(f) + " = " + tex(result))
    return result


def solve_integral(I, ctx):
    sp, tex = ctx.sp, ctx.tex
    f = I.function
    lim = I.limits[0]
    x = lim[0]
    definite = len(lim) == 3
    a, b = (lim[1], lim[2]) if definite else (None, None)
    ctx.add("Write the integral", tex(I))
    mark = len(ctx.steps)
    F = None
    try:
        from sympy.integrals.manualintegrate import integral_steps
        F = rule_steps(ctx, integral_steps(f, x), x)
        if F is None or F.has(sp.Integral):
            F = None
    except Exception:  # noqa: BLE001
        F = None
    if F is None:
        del ctx.steps[mark:]
        F = sp.integrate(f, x)
        if F.has(sp.Integral):
            raise Unsupported("No closed-form antiderivative was found for this integral.")
        ctx.add("Integrate", tex(sp.Integral(f, x)) + " = " + tex(F))
    if not definite:
        ctx.add("Add the constant of integration", tex(sp.Integral(f, x)) + " = " + tex(F) + " + C")
        return finish(ctx, "integral", "Indefinite integral", tex(F) + " + C", "", tex(x), [str(x)])

    ctx.add("The antiderivative", "F(" + tex(x) + ") = " + tex(F))
    if not any(v in (sp.oo, -sp.oo) for v in (a, b)):
        Fb, Fa = F.subs(x, b), F.subs(x, a)
        ctx.add("Evaluate F at the upper and lower limits",
                "\\left[" + tex(F) + "\\right]_{" + tex(a) + "}^{" + tex(b) + "} = " + tex(Fb) + " - \\left(" + tex(Fa) + "\\right)")
        val = sp.simplify(Fb - Fa)
        try:
            ref = sp.integrate(f, (x, a, b))
            if not ref.has(sp.Integral) and sp.simplify(val - ref) != 0:
                val = ref
                ctx.notes.append("The exact definite integral was used (the antiderivative has a break between the limits).")
        except Exception:  # noqa: BLE001
            pass
        ctx.add("Subtract", "= " + tex(val))
    else:
        val = sp.integrate(f, (x, a, b))
        if val.has(sp.Integral):
            raise Unsupported("This improper integral could not be evaluated.")
        ctx.add("Take the limits (improper integral)", tex(I) + " = " + tex(val))
        if val.is_infinite:
            ctx.notes.append("The integral diverges.")
    return finish(ctx, "integral", "Definite integral", tex(val), decimal_text(sp, val), tex(x), [str(x)])


# ===================================================================== derivatives
def diff_steps(ctx, e, x):
    sp, tex = ctx.sp, ctx.tex
    xs = tex(x)

    def D(g):
        return "\\frac{d}{d" + xs + "}\\left(" + tex(g) + "\\right)"

    if not e.has(x):
        ctx.add("The derivative of a constant is 0", D(e) + " = 0")
        return sp.Integer(0)
    if e == x:
        ctx.add("The derivative of " + xs + " is 1", D(e) + " = 1")
        return sp.Integer(1)
    if e.is_Add:
        terms = list(e.args)
        ctx.add("Differentiate term by term (sum rule)", D(e) + " = " + " + ".join(D(t) for t in terms))
        total = sp.Integer(0)
        for t in terms:
            total += diff_steps(ctx, t, x)
        return total
    if e.is_Mul:
        c, r = e.as_independent(x, as_Add=False)
        if c != 1:
            ctx.add("Take the constant factor out", D(e) + " = " + tex(c) + "\\cdot\\frac{d}{d" + xs + "}\\left(" + tex(r) + "\\right)")
            return c * diff_steps(ctx, r, x)
        n, d = sp.fraction(e)
        if d.has(x) and n.has(x):
            ctx.add("Use the quotient rule:  (u/v)′ = (u′v − uv′) / v²", "u = " + tex(n) + ",\\quad v = " + tex(d))
            du, dv = diff_steps(ctx, n, x), diff_steps(ctx, d, x)
            res = (du * d - n * dv) / d ** 2
            ctx.add("Substitute into the quotient rule", "\\frac{\\left(" + tex(du) + "\\right)\\left(" + tex(d) + "\\right) - \\left(" + tex(n) + "\\right)\\left(" + tex(dv) + "\\right)}{\\left(" + tex(d) + "\\right)^{2}}")
            return res
        fs = list(sp.Mul.make_args(e))
        u, w = fs[0], sp.Mul(*fs[1:])
        ctx.add("Use the product rule:  (u·v)′ = u′v + uv′", "u = " + tex(u) + ",\\quad v = " + tex(w))
        du, dw = diff_steps(ctx, u, x), diff_steps(ctx, w, x)
        ctx.add("Substitute into the product rule", "\\left(" + tex(du) + "\\right)\\left(" + tex(w) + "\\right) + \\left(" + tex(u) + "\\right)\\left(" + tex(dw) + "\\right)")
        return du * w + u * dw
    if e.is_Pow:
        b, p = e.base, e.exp
        if not p.has(x):
            if b == x:
                res = p * x ** (p - 1)
                ctx.add("Use the power rule:  (xⁿ)′ = n·xⁿ⁻¹", D(e) + " = " + tex(res))
                return res
            ctx.add("Use the chain rule with the power rule",
                    D(e) + " = " + tex(p) + "\\left(" + tex(b) + "\\right)^{" + tex(p - 1) + "}\\cdot\\frac{d}{d" + xs + "}\\left(" + tex(b) + "\\right)")
            return p * b ** (p - 1) * diff_steps(ctx, b, x)
        if not b.has(x):
            factor = "" if b == sp.E else "\\cdot\\ln\\left(" + tex(b) + "\\right)"
            ctx.add("Use the exponential rule", D(e) + " = " + tex(e) + factor + "\\cdot\\frac{d}{d" + xs + "}\\left(" + tex(p) + "\\right)")
            dp = diff_steps(ctx, p, x)
            return e * (sp.Integer(1) if b == sp.E else sp.log(b)) * dp
        res = sp.diff(e, x)
        ctx.add("Use logarithmic differentiation", D(e) + " = " + tex(res))
        return res
    if isinstance(e, sp.Function) and len(e.args) == 1 and not isinstance(e.func, sp.core.function.UndefinedFunction):
        u = e.args[0]
        uu = sp.Dummy("u")
        outer = sp.diff(e.func(uu), uu).subs(uu, u)
        if u == x:
            ctx.add("Use the standard derivative", D(e) + " = " + tex(outer))
            return outer
        ctx.add("Use the chain rule", D(e) + " = " + tex(outer) + "\\cdot\\frac{d}{d" + xs + "}\\left(" + tex(u) + "\\right)")
        return outer * diff_steps(ctx, u, x)
    res = sp.diff(e, x)
    ctx.add("Differentiate", D(e) + " = " + tex(res))
    return res


def solve_derivative(Dv, ctx):
    sp, tex = ctx.sp, ctx.tex
    expr = Dv.expr
    x, n = Dv.variable_count[0]
    n = int(n)
    ctx.add("Write the derivative", tex(Dv))
    mark = len(ctx.steps)
    ref = sp.diff(expr, x, n)
    ok = False
    try:
        cur = expr
        for k in range(n):
            if n > 1:
                ctx.add("Derivative number " + str(k + 1))
            cur = diff_steps(ctx, cur, x)
        ok = sp.simplify(cur - ref) == 0
    except Exception:  # noqa: BLE001
        ok = False
    final = sp.simplify(ref)
    if not ok:
        del ctx.steps[mark:]
        ctx.add("Differentiate", tex(Dv) + " = " + tex(ref))
        ctx.notes.append("Detailed rule-by-rule steps were not available for this one.")
    ctx.add("Simplify", "= " + tex(final))
    return finish(ctx, "derivative", "Derivative", tex(final), "", tex(x), [str(x)])


# ===================================================================== limits, sums, matrices
def solve_limit(Lm, ctx):
    sp, tex = ctx.sp, ctx.tex
    e, x, a = Lm.args[0], Lm.args[1], Lm.args[2]
    try:
        direction = str(Lm.args[3])
    except Exception:  # noqa: BLE001
        direction = "+-"
    if direction not in ("+", "-", "+-"):
        direction = "+-"
    ctx.add("Write the limit", tex(Lm))
    final = sp.limit(e, x, a, direction)
    if a not in (sp.oo, -sp.oo):
        direct = e.subs(x, a)
        if not direct.has(sp.nan, sp.zoo, sp.oo, -sp.oo):
            ctx.add("Substitute " + tex(x) + " = " + tex(a) + " (the function is continuous there)", "\\lim = " + tex(direct))
            return finish(ctx, "limit", "Limit", tex(direct), decimal_text(sp, direct), tex(x), [str(x)])
        n, d = sp.fraction(sp.together(e))
        if d.has(x) and n.subs(x, a) == 0 and d.subs(x, a) == 0:
            ctx.add("Substituting gives 0/0, an indeterminate form", "\\frac{0}{0}")
            canc = sp.cancel(sp.together(e))
            if canc != e and not canc.subs(x, a).has(sp.nan, sp.zoo):
                ctx.add("Cancel the common factor", "\\lim " + tex(canc))
            else:
                dn, dd = sp.diff(n, x), sp.diff(d, x)
                ctx.add("Apply L'Hôpital's rule: differentiate the top and the bottom", "\\lim \\frac{" + tex(dn) + "}{" + tex(dd) + "}")
        else:
            ctx.add("Direct substitution is not enough here; evaluate the limit carefully", "\\lim = " + tex(final))
    else:
        ctx.add("Look at the behaviour as " + tex(x) + " grows without bound", "\\lim = " + tex(final))
    ctx.add("The limit", "= " + tex(final))
    return finish(ctx, "limit", "Limit", tex(final), decimal_text(sp, final), tex(x), [str(x)])


def solve_bigop(S, ctx):
    sp, tex = ctx.sp, ctx.tex
    is_sum = isinstance(S, sp.Sum)
    body = S.function
    i, lo, hi = S.limits[0]
    ctx.add("Write the " + ("sum" if is_sum else "product"), tex(S))
    try:
        count = int(hi - lo + 1) if (hi - lo).is_number else None
    except Exception:  # noqa: BLE001
        count = None
    if count is not None and 1 < count <= 6:
        terms = [body.subs(i, lo + k) for k in range(count)]
        ctx.add("Write out the terms", (" + " if is_sum else " \\cdot ").join("\\left(" + tex(t) + "\\right)" for t in terms))
    val = S.doit()
    if isinstance(val, (sp.Sum, sp.Product)):
        raise Unsupported("No closed form was found for this " + ("sum" if is_sum else "product") + ".")
    ctx.add("Evaluate", "= " + tex(val))
    return finish(ctx, "sum" if is_sum else "product", "Sum" if is_sum else "Product", tex(val), decimal_text(sp, val), tex(i), [])


def solve_matrix(M, ctx):
    sp, tex = ctx.sp, ctx.tex
    ctx.add("The matrix", tex(M))
    if M.is_square:
        det = sp.simplify(M.det())
        if M.shape == (2, 2):
            ctx.add("Determinant of a 2×2 matrix:  ad − bc", "\\det = " + tex(M[0, 0]) + "\\cdot" + tex(M[1, 1]) + " - " + tex(M[0, 1]) + "\\cdot" + tex(M[1, 0]) + " = " + tex(det))
        else:
            ctx.add("Determinant", "\\det = " + tex(det))
        if det != 0:
            ctx.add("Inverse matrix", "A^{-1} = " + tex(M.inv()))
        else:
            ctx.add("The determinant is 0, so the matrix has no inverse")
        ctx.add("Transpose", "A^{T} = " + tex(M.T))
        return finish(ctx, "matrix", "Matrix", "\\det = " + tex(det), decimal_text(sp, det), "", [])
    rk = M.rank()
    ctx.add("Rank", "\\operatorname{rank} = " + tex(rk))
    ctx.add("Transpose", "A^{T} = " + tex(M.T))
    return finish(ctx, "matrix", "Matrix", "\\operatorname{rank} = " + tex(rk), "", "", [])


# ===================================================================== equations
def solve_statement(is_true, rel, ctx):
    ctx.add("Compare both sides", ctx.tex(rel))
    return finish(ctx, "equation", "Statement", "\\text{True}" if is_true else "\\text{False}")


def solve_equation(rel, ctx, pref):
    sp, tex = ctx.sp, ctx.tex
    lhs, rhs = rel.lhs, rel.rhs
    f = sp.expand(lhs - rhs)
    syms = sorted(f.free_symbols, key=str)
    if not syms:
        return solve_statement(sp.simplify(f) == 0, rel, ctx)
    var = pick_var(syms, pref)
    xs = tex(var)
    ctx.add("Write the equation", tex(rel))
    if rhs != 0:
        ctx.add("Move everything to one side", tex(f) + " = 0")
    P, deg = None, None
    try:
        P = sp.Poly(f, var)
        deg = P.degree()
        if any(c.has(var) for c in P.all_coeffs()):
            P = None
    except Exception:  # noqa: BLE001
        P = None
    sols = None
    if P is not None and deg == 1:
        a_, b_ = P.all_coeffs()
        ctx.add("This is a linear equation  ax + b = 0", "a = " + tex(a_) + ",\\quad b = " + tex(b_))
        ctx.add("Move the constant to the other side", tex(a_ * var) + " = " + tex(-b_))
        ctx.add("Divide both sides by " + tex(a_), xs + " = " + tex(sp.simplify(-b_ / a_)))
        sols = [sp.simplify(-b_ / a_)]
    elif P is not None and deg == 2:
        a_, b_, c_ = P.all_coeffs()
        ctx.add("This is a quadratic equation  ax² + bx + c = 0", "a = " + tex(a_) + ",\\quad b = " + tex(b_) + ",\\quad c = " + tex(c_))
        Dv = sp.simplify(b_ ** 2 - 4 * a_ * c_)
        ctx.add("Find the discriminant  D = b² − 4ac", "D = \\left(" + tex(b_) + "\\right)^{2} - 4\\left(" + tex(a_) + "\\right)\\left(" + tex(c_) + "\\right) = " + tex(Dv))
        if Dv.is_number:
            kind = "D > 0: two different real solutions" if Dv.is_positive else ("D = 0: one repeated solution" if Dv == 0 else "D < 0: two complex solutions")
            ctx.add(kind)
        fac = sp.factor(f)
        if fac != f:
            ctx.add("It also factors, which is a quick way to see the solutions", tex(fac) + " = 0")
        ctx.add("Use the quadratic formula  x = (−b ± √D) / 2a", xs + " = \\frac{-\\left(" + tex(b_) + "\\right) \\pm \\sqrt{" + tex(Dv) + "}}{2\\left(" + tex(a_) + "\\right)}")
        sols = sp.solve(f, var)
    elif P is not None and deg is not None and deg >= 3:
        ctx.add("Factorise", tex(sp.factor(f)) + " = 0")
        sols = sp.solve(f, var)
        ctx.add("Set each factor equal to zero and solve", ",\\quad ".join(xs + " = " + tex(s) for s in sols))
    else:
        sols = sp.solve(f, var)
        ctx.add("Solve the equation for " + xs, ",\\quad ".join(xs + " = " + tex(s) for s in sols) if sols else "\\text{no solution found}")
    if isinstance(sols, dict):
        sols = [sols.get(var)] if var in sols else []
    sols = list(sols or [])
    try:
        sols = sorted(sols, key=lambda s: float(sp.re(s)))
    except Exception:  # noqa: BLE001
        pass
    lines = []
    for s in sols[:4]:
        L, R = sp.simplify(lhs.subs(var, s)), sp.simplify(rhs.subs(var, s))
        lines.append(xs + " = " + tex(s) + ":\\quad " + tex(L) + " = " + tex(R))
    if lines:
        ctx.add("Check each solution in the original equation", "\\begin{aligned}" + " \\\\ ".join(lines) + "\\end{aligned}")
    answer = ",\\quad ".join(xs + " = " + tex(s) for s in sols) if sols else "\\text{No solution}"
    decs = [decimal_text(sp, s) for s in sols]
    dec = ", ".join(xs + " ≈ " + d for d in decs if d) if decs and all(decs) else ""
    return finish(ctx, "equation", "Equation", answer, dec, str(var), [str(s) for s in syms])


def solve_system(items, ctx, pref):
    sp, tex = ctx.sp, ctx.tex
    rels = [r if getattr(r, "is_Relational", False) else sp.Eq(r, 0) for r in items]
    exprs = [sp.expand(r.lhs - r.rhs) for r in rels]
    vars_ = sorted(set().union(*[e.free_symbols for e in exprs]), key=str)
    if not vars_:
        raise Unsupported("There is nothing to solve for in this system.")
    ctx.add("Write the system", "\\begin{cases}" + " \\\\ ".join(tex(r) for r in rels) + "\\end{cases}")
    names = [str(v) for v in vars_]
    done = False
    if len(vars_) == 2 and len(exprs) == 2:
        try:
            if all(sp.Poly(e, *vars_).total_degree() <= 1 for e in exprs):
                x, y = vars_
                e1, e2 = exprs
                first = x if e1.has(x) else y
                second = y if first == x else x
                s1 = sp.solve(e1, first)[0]
                ctx.add("Solve the first equation for " + tex(first), tex(first) + " = " + tex(s1))
                e2s = sp.expand(e2.subs(first, s1))
                ctx.add("Substitute it into the second equation", tex(e2.subs(first, s1)) + " = 0")
                sv = sp.solve(e2s, second)
                if sv:
                    sec_val = sv[0]
                    ctx.add("Solve for " + tex(second), tex(second) + " = " + tex(sec_val))
                    first_val = sp.simplify(s1.subs(second, sec_val))
                    ctx.add("Substitute back to find " + tex(first), tex(first) + " = " + tex(first_val))
                    sol = {first: first_val, second: sec_val}
                    answer = ",\\quad ".join(tex(v) + " = " + tex(sol[v]) for v in vars_)
                    return finish(ctx, "system", "System of equations", answer, "", "", names)
        except Exception:  # noqa: BLE001
            del ctx.steps[1:]
    sols = sp.solve(rels, vars_, dict=True)
    if not sols:
        ctx.add("Solve the system", "\\text{no solution}")
        return finish(ctx, "system", "System of equations", "\\text{No solution}", "", "", names)
    parts = []
    for s in sols[:4]:
        parts.append(",\\ ".join(tex(v) + " = " + tex(s.get(v, v)) for v in vars_))
    answer = "\\ \\text{or}\\ ".join(parts)
    ctx.add("Solve the system (elimination / substitution)", answer)
    return finish(ctx, "system", "System of equations", answer, "", "", names)


def solve_inequality(rel, ctx, pref):
    sp, tex = ctx.sp, ctx.tex
    lhs, rhs = rel.lhs, rel.rhs
    f = sp.expand(lhs - rhs)
    syms = sorted(f.free_symbols, key=str)
    if not syms:
        return solve_statement(bool(rel.doit()), rel, ctx)
    var = pick_var(syms, pref)
    xs = tex(var)
    ctx.add("Write the inequality", tex(rel))
    try:
        roots = sp.solve(sp.Eq(lhs, rhs), var)
    except Exception:  # noqa: BLE001
        roots = []
    if roots:
        ctx.add("Find the boundary points (solve the related equation)", ",\\quad ".join(xs + " = " + tex(r) for r in roots))
    ctx.add("Test a value in each region between the boundary points and keep the regions where the inequality is true")
    sol = sp.solveset(rel, var, domain=sp.S.Reals)
    ctx.add("The solution set", xs + " \\in " + tex(sol))
    return finish(ctx, "inequality", "Inequality", xs + " \\in " + tex(sol), "", str(var), [str(s) for s in syms])


# ===================================================================== plain expressions
def solve_expression(e, ctx):
    sp, tex = ctx.sp, ctx.tex
    ctx.add("The expression", tex(e))
    if not e.free_symbols:
        val = sp.simplify(e)
        ctx.add("Evaluate", tex(e) + " = " + tex(val))
        return finish(ctx, "expression", "Evaluate", tex(val), decimal_text(sp, val))
    simp = sp.simplify(e)
    ctx.add("Simplify", tex(e) + " = " + tex(simp))
    exp_form, fac_form = sp.expand(e), sp.factor(e)
    if exp_form != simp:
        ctx.add("Expanded form", "= " + tex(exp_form))
    if fac_form != simp and fac_form != exp_form:
        ctx.add("Factored form", "= " + tex(fac_form))
    return finish(ctx, "expression", "Simplify", tex(simp))


def solve_composite(e, ctx):
    sp, tex = ctx.sp, ctx.tex
    ctx.add("The expression", tex(e))
    val = sp.simplify(e.doit())
    ctx.add("Evaluate each part and combine", "= " + tex(val))
    return finish(ctx, "expression", "Evaluate", tex(val), decimal_text(sp, val))