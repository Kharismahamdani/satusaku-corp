@echo off
title SATUSAKU CORP.
color 0B

echo ============================================
echo   SATUSAKU CORP.
echo   Localhost UI/UX Interface
echo ============================================
echo.
echo   Sedang memulai server...
echo.

:: Navigate to project directory
cd /d "%~dp0"

:: Install dependencies if needed
if not exist "node_modules\" (
    echo   Menginstal dependencies...
    call npm install
    echo.
)

:: Start the server
echo   Server akan berjalan di: http://localhost:3000
echo   Browser akan otomatis terbuka...
echo   Press Ctrl+C untuk stop
echo.

:: Open browser after 2 seconds
timeout /t 2 /nobreak >nul
start http://localhost:3000

:: Run server
node backend/server.js

pause