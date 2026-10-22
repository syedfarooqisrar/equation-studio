# 📁 FILE: D:\EquationTool\tools\test_solver.py
# 📌 WHAT: Quick self-test of the solver (no app needed). Run:  python tools\test_solver.py
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from solver_engine import solve_request  # noqa: E402

CASES = [
    r"\int_1^2 x\,dx",
    r"\int x^{2}\,dx",
    r"\int x\sin x\,dx",
    r"\int 2x\cos\left(x^{2}\right)dx",
    r"\int_0^{\pi}\sin x\,dx",
    r"\frac{d}{dx}\left(x^{3}+2x\right)",
    r"\frac{d}{dx}\sin\left(x^{2}\right)",
    r"\frac{d}{dx}\frac{x}{x+1}",
    r"\lim_{x\to0}\frac{\sin x}{x}",
    r"\lim_{x\to2}\frac{x^{2}-4}{x-2}",
    r"x^{2}-5x+6=0",
    r"2x+3=11",
    r"\begin{cases}x+y=5\\x-y=1\end{cases}",
    r"x^{2}+3x+2<0",
    r"\sum_{i=1}^{5}i^{2}",
    r"\frac{3}{4}+\frac{5}{6}",
]

bad = 0
for n, latex in enumerate(CASES, 1):
    res = solve_request({"id": n, "latex": latex, "var": None})
    ok = res.get("ok")
    bad += 0 if ok else 1
    print(("OK   " if ok else "FAIL ") + latex)
    if ok:
        print("       answer:", res["answer"], "| steps:", len(res["steps"]), "|", res["title"])
    else:
        print("       error :", res.get("error"), "|", res.get("hint"))
print("\n%d of %d solved" % (len(CASES) - bad, len(CASES)))