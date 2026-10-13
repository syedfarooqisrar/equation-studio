:: 📁 FILE: D:\EquationTool\build.bat
:: 📌 WHAT: One-click PyInstaller build (onedir) -> dist\EquationStudio\EquationStudio.exe

@echo off
cd /d "%~dp0"

if not exist icon.ico python make_icon.py

if not exist fonts\KaTeX_Main-Regular.woff2 (
  echo ERROR: fonts folder missing. Run download_fonts.ps1 first.
  pause
  exit /b 1
)

python -m PyInstaller --noconfirm --clean --windowed --name EquationStudio --icon icon.ico ^
  --add-data "word_style_editor.html;." ^
  --add-data "mathlive.min.js;." ^
  --add-data "fonts;fonts" ^
  --add-data "icon.ico;." ^
  test.py

if errorlevel 1 (
  echo.
  echo BUILD FAILED. Scroll up and copy the first ERROR line.
  pause
  exit /b 1
)

echo.
echo BUILD OK. Open: dist\EquationStudio\EquationStudio.exe
pause