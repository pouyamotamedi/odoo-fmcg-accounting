@echo off
chcp 65001 >nul
title FMCG - New Business Setup
echo ============================================
echo   Create New Business (Fresh Database)
echo ============================================
echo.
echo   This creates a clean database with all
echo   modules pre-installed. No data inside.
echo.

set /p DBNAME=Database name (english, no spaces, e.g. shop_ali): 
if "%DBNAME%"=="" (
    echo Cancelled.
    pause
    exit /b
)

echo.
echo [1/5] Creating database '%DBNAME%'...
set PGPASSWORD=odoo
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "CREATE DATABASE %DBNAME% OWNER odoo ENCODING 'UTF8';"
if errorlevel 1 (
    echo ERROR: Database may already exist or PostgreSQL is not running.
    echo Trying to drop and recreate...
    "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "DROP DATABASE IF EXISTS %DBNAME%;"
    "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "CREATE DATABASE %DBNAME% OWNER odoo ENCODING 'UTF8';"
)

echo [2/5] Installing modules (2-3 minutes)...
python "C:\Users\pouya\Desktop\accounting\odoo\odoo-bin" -c "C:\Users\pouya\Desktop\accounting\odoo.conf" -d %DBNAME% -i base,account,stock,product,l10n_ir,fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount,fmcg_inventory,fmcg_persian,fmcg_offline,fmcg_pos_terminal,fmcg_reports --stop-after-init --without-demo=all
if errorlevel 1 (
    echo ERROR: Module install failed!
    pause
    exit /b
)

echo [3/5] Updating odoo.conf...
powershell -Command "(Get-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf') -replace 'db_name = .*', 'db_name = %DBNAME%' | Set-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf'"

echo [4/5] Updating frontend config...
echo NEXT_PUBLIC_ODOO_URL=/api> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"
echo NEXT_PUBLIC_ODOO_DB=%DBNAME%>> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"

echo [5/5] Applying Persian translations...
echo Starting Odoo temporarily for translations...
start "OdooTemp" python "C:\Users\pouya\Desktop\accounting\odoo\odoo-bin" -c "C:\Users\pouya\Desktop\accounting\odoo.conf" -d %DBNAME%
echo Waiting 10 seconds for Odoo to start...
timeout /t 10 /nobreak >nul
python "C:\Users\pouya\Desktop\accounting\apply_translations.py" %DBNAME%
echo Stopping temporary Odoo...
taskkill /fi "WINDOWTITLE eq OdooTemp" /f 2>nul
taskkill /fi "WINDOWTITLE eq OdooTemp*" /f 2>nul

echo [5/5] Done!
echo.
echo ============================================
echo   Business '%DBNAME%' is ready!
echo   Run start.bat to launch.
echo   Login: admin / admin
echo ============================================
echo.
pause
