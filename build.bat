:: 📁 FILE: D:\EquationTool\build.bat
:: 📌 WHAT: One-click PyInstaller build (onedir) -> dist\EquationStudio\EquationStudio.exe

@echo off
cd /d "%~dp0"

if not exist icon.ico python tools\make_icon.py

if not exist fonts\KaTeX_Main-Regular.woff2 (
  echo ERROR: fonts folder missing. Run: powershell -ExecutionPolicy Bypass -File tools\download_fonts.ps1
  pause
  exit /b 1
)
if not exist assets\solver-ui.js (
  echo ERROR: assets folder is incomplete.
  pause
  exit /b 1
)

python -m PyInstaller --noconfirm --clean --windowed --name EquationStudio --icon icon.ico ^
  --add-data "word_style_editor.html;." ^
  --add-data "mathlive.min.js;." ^
  --add-data "assets;assets" ^
  --add-data "fonts;fonts" ^
  --add-data "icon.ico;." ^
  --hidden-import studio_app --hidden-import solver_engine ^
  --collect-all sympy --collect-all mpmath ^
  main.py

if errorlevel 1 (
  echo.
  echo BUILD FAILED. Scroll up and copy the first ERROR line.
  pause
  exit /b 1
)

echo.
echo BUILD OK. Open: dist\EquationStudio\EquationStudio.exe
pause