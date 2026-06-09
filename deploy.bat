@echo off
title SATUSAKU CORP. - Quick Deploy to Render
color 0B
echo ============================================
echo   SATUSAKU CORP. - Deploy Helper
echo ============================================
echo.

echo [!] Prasyarat:
echo     1. Akun GitHub (https://github.com)
echo     2. Git terinstall (https://git-scm.com)
echo     3. Akun Render (https://render.com)
echo.
echo ============================================
echo.

set /p GHUSER="Masukkan username GitHub kamu: "
if "%GHUSER%"=="" (
    echo [X] Username GitHub tidak boleh kosong!
    pause
    exit /b
)

set /p REPO="Nama repository (default: satusaku-corp): "
if "%REPO%"=="" set REPO=satusaku-corp

echo.
echo [1/5] Inisialisasi Git repository...
git init 2>nul
git branch -M main

echo [2/5] Menambahkan semua file (kecuali yang di .gitignore)...
git add .

echo [3/5] Commit...
git commit -m "SATUSAKU CORP. v3.0 - Affiliate Platform with Digiflazz" 2>nul

echo [4/5] Setup remote GitHub...
git remote remove origin 2>nul
git remote add origin https://github.com/%GHUSER%/%REPO%.git

echo [5/5] Push ke GitHub...
echo.
echo [!] Jika ini pertama kali push, kamu mungkin diminta login GitHub.
echo [!] Atau buat repo di https://github.com/new dulu jika belum ada.
echo.
git push -u origin main

echo.
echo ============================================
echo   SELESAI! 
echo ============================================
echo.
echo LANGKAH SELANJUTNYA:
echo.
echo 1. Buka https://render.com
echo 2. Login dengan GitHub
echo 3. Klik "New +" -^> "Web Service"
echo 4. Pilih repository: %REPO%
echo 5. Setting:
echo    - Build Command:  npm install
echo    - Start Command:  node backend/server.js
echo    - Instance Type:  Free
echo 6. Klik "Create Web Service"
echo.
echo URL Aplikasi kamu: https://%REPO%.onrender.com
echo Admin login: admin / admin123
echo.
echo ============================================
echo.
pause