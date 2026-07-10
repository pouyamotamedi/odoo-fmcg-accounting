@echo off
title FMCG Accounting - Startup
echo ========================================
echo   Starting FMCG Accounting System
echo ========================================
echo.

echo [1/2] Starting Odoo backend (port 8069)...
start "Odoo Backend" cmd /k "cd /d C:\Users\pouya\Desktop\accounting\odoo && python odoo-bin -c C:\Users\pouya\Desktop\accounting\odoo.conf"

echo Waiting 5 seconds for Odoo to initialize...
timeout /t 5 /nobreak >nul

echo [2/2] Starting Next.js frontend (port 3000)...
start "Next.js Frontend" cmd /k "cd /d C:\Users\pouya\Desktop\accounting\frontend && npm run dev"

echo.
echo ========================================
echo   Both servers starting!
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8069
echo ========================================
echo.
echo You can close this window.
pause
