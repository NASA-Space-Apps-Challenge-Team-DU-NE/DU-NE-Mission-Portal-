@echo off
cd /d "%~dp0"
if not exist web\node_modules call npm install
if not exist orbit\frontend\node_modules call npm install
call npm run dev
pause
