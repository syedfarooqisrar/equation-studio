# 📁 FILE: D:\EquationTool\main.py
"""Launcher. Kept tiny on purpose: the solver's worker process imports this file again."""
import multiprocessing
import sys


def _run() -> int:
    from studio_app import main
    return main()


if __name__ == "__main__":
    multiprocessing.freeze_support()  # required for the packaged exe
    sys.exit(_run())