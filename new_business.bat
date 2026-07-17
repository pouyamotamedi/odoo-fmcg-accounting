@echo off
chcp 65001 >nul
title FMCG - New Business Setup
echo ============================================
echo   Create New Business (Fresh Database)
echo ============================================
echo.
echo   Creates a clean database with:
echo   - All modules installed
echo   - Persian language + translations
echo   - No demo data
echo.

set /p DBNAME=Database name (english, no spaces, e.g. shop_ali): 
if "%DBNAME%"=="" (
    echo Cancelled.
    pause
    exit /b
)

echo.
echo [1/6] Creating database '%DBNAME%'...
set PGPASSWORD=odoo
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "CREATE DATABASE %DBNAME% OWNER odoo ENCODING 'UTF8';" 2>nul
if errorlevel 1 (
    echo Database may already exist. Drop and recreate? (Y/N)
    set /p DROP=
    if /i "%DROP%"=="Y" (
        "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='%DBNAME%';" 2>nul
        "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "DROP DATABASE %DBNAME%;"
        "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "CREATE DATABASE %DBNAME% OWNER odoo ENCODING 'UTF8';"
    ) else (
        echo Cancelled.
        pause
        exit /b
    )
)

echo [2/6] Installing modules + Persian language (3-5 minutes)...
echo       Please wait...
python "C:\Users\pouya\Desktop\accounting\odoo\odoo-bin" -c "C:\Users\pouya\Desktop\accounting\odoo.conf" -d %DBNAME% -i base,account,stock,product,l10n_ir,fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount,fmcg_inventory,fmcg_persian,fmcg_offline,fmcg_pos_terminal,fmcg_reports --stop-after-init --without-demo=all --load-language=fa_IR
if errorlevel 1 (
    echo ERROR: Module install failed!
    pause
    exit /b
)

echo [3/6] Setting admin language to Persian...
set PGPASSWORD=odoo
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d %DBNAME% -c "UPDATE res_users SET lang='fa_IR' WHERE id=2;"
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d %DBNAME% -c "UPDATE res_partner SET lang='fa_IR' WHERE id IN (SELECT partner_id FROM res_users WHERE id=2);"

echo [4/6] Updating odoo.conf...
powershell -Command "(Get-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf') -replace 'db_name = .*', 'db_name = %DBNAME%' | Set-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf'"

echo [5/6] Updating frontend config...
echo NEXT_PUBLIC_ODOO_URL=/api> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"
echo NEXT_PUBLIC_ODOO_DB=%DBNAME%>> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"

echo [6/6] Applying Persian translations to journals and accounts...
echo       Starting Odoo temporarily...
start "" /min python "C:\Users\pouya\Desktop\accounting\odoo\odoo-bin" -c "C:\Users\pouya\Desktop\accounting\odoo.conf"
timeout /t 15 /nobreak >nul
python "C:\Users\pouya\Desktop\accounting\apply_translations.py" %DBNAME%
taskkill /f /fi "WINDOWTITLE eq C:\Users\pouya\Desktop\accounting\odoo\odoo-bin*" 2>nul
taskkill /f /im python.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo ============================================
echo   Done! Business '%DBNAME%' is ready.
echo ============================================
echo.
echo   Run start.bat to launch.
echo   Login: admin / admin
echo.
echo   What was installed:
echo   - All FMCG modules
echo   - Persian language
echo   - Persian journal names
echo   - Persian account names
echo   - Iranian chart of accounts (l10n_ir)
echo.
pause
