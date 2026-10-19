# Equation Studio

A free, Word-style equation editor that floats on top of any app.
Write text and math together, then copy the result as a clean image.

## Features
- Word-like ribbon: Fraction, Script, Radical, Integral, Matrix, Cases and more
- Symbols tab with Greek, Arrows, Sets and search
- Next Step button for step-by-step solutions
- Copy the whole document as an image (always light and clean)
- Undo/Redo, auto-save, dark mode, zoom, keyboard shortcuts
- Always-on-top window
- Word-style Equation tab: all Structures (Fraction, Script, Radical, Integral, Large Operator, Bracket, Function, Accent, Limit and Log, Operator, Matrix)
- 170+ ready equations (algebra, geometry, trigonometry, calculus, linear algebra, statistics, physics)
- Print Layout (A4 / Letter pages) and Web Layout, per-page copy/save/delete, page navigator
- Save as PDF, LaTeX editor, Copy LaTeX / MathML

## Known issues

- **Accent / Bar / Box items on an empty equation:** on some PCs the empty box that appears after choosing an accent
  (Dot, Hat, Tilde, ...) cannot be typed into. Workaround: type the letter or number first, then apply the accent
  to it, or select the text and apply the accent.

## Tech stack
Python, PySide6 (QtWebEngine), MathLive (HTML/CSS/JS)

## Run
    pip install PySide6 pywin32
    python test.py

## Author
Syed Farooq Israr (FarooqBuilds)