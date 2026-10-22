# Equation Studio

A free, Word-style equation editor for Windows. Write text and math together, then copy the result as a clean image
(ideal for online exam answer boxes). Fully offline: no account, no internet, no tracking.

## Features

- Word-style **Equation** tab: Fraction, Script, Radical, Integral, Large Operator, Bracket, Function, Accent,
  Limit and Log, Operator, Matrix, Cases, Aligned, Style and Spacing
- 170+ ready equations (algebra, geometry, trigonometry, calculus, linear algebra, statistics, physics)
- 12 symbol categories with search and recent symbols
- Print Layout (A4 / Letter pages) and Web Layout, per-page copy / save / delete, page navigator
- Copy as image, save as PNG or PDF, copy LaTeX / MathML, edit any equation as LaTeX
- Auto-save, undo/redo, dark mode, zoom, keyboard shortcuts

## Download (Windows)

Get the latest `EquationStudio-*-win64.zip` from Releases, extract it and run `EquationStudio.exe`.
The app is unsigned, so Windows SmartScreen may warn: click "More info", then "Run anyway".

## Run from source

    pip install -r requirements.txt
    python main.py

## Build the exe

    powershell -ExecutionPolicy Bypass -File tools\download_fonts.ps1   (first time only)
    .\build.bat

## Project layout

    main.py                      desktop shell (PySide6): capture, PDF, security, crash recovery
    word_style_editor.html       editor markup
    assets/app.css               design system and layout
    assets/app.js                application logic
    assets/equation-data.js      equation menus, gallery, symbols
    assets/mathlive-config.js    offline MathLive setup
    tools/                       font downloader and icon generator

## Privacy and security

- Everything stays on your PC. The app makes no network requests.
- Saved documents are sanitized when loaded; the window can only show the bundled editor page
  (links, pop-ups and dropped files are blocked); only one copy can run at a time.
- Logs (`equation_studio.log`, `crash.log`) stay next to the app and contain no document content.

## Known issues

- **Accent / Bar / Box items on an empty equation:** on some PCs the empty box that appears after choosing an accent
  (Dot, Hat, Tilde, ...) cannot be typed into. Workaround: type the letter or number first, then apply the accent.

## Credits

[MathLive](https://cortexjs.io/mathlive/) (MIT) for math editing, KaTeX fonts (MIT / OFL), PySide6 / Qt.