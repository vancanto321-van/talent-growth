@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 22 or newer, then reopen this window.
  pause
  exit /b 1
)
node scripts\start.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
