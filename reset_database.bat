@echo off
title FMCG - Database Reset / New Database
echo ============================================
echo   FMCG Database Management Tool
echo ============================================
echo.
echo   Current database: fmcg_shop
echo   DB User: odoo / Password: odoo
echo.
echo Choose an option:
echo   1. Reset database (drop + recreate + auto-install modules)
echo   2. Create FRESH database with auto module install (keeps old DB)
echo   3. Cancel
echo.
set /p CHOICE=Enter choice (1/2/3): 

if "%CHOICE%"=="3" goto :cancel
if "%CHOICE%"=="2" goto :fresh
if "%CHOICE%"=="1" goto :reset
goto :cancel

:reset
echo.
echo WARNING: This will DELETE all data in 'fmcg_shop'!
set /p CONFIRM=Type "YES" to confirm: 
if not "%CONFIRM%"=="YES" goto :cancel

echo.
echo [1/4] Stopping Odoo...
taskkill /f /im python.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] Dropping database...
set PGPASSWORD=odoo
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='fmcg_shop' AND pid <> pg_backend_pid();" 2>nul
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "DROP DATABASE IF EXISTS fmcg_shop;"
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "CREATE DATABASE fmcg_shop OWNER odoo ENCODING 'UTF8';"

echo [3/4] Initializing Odoo with modules...
echo This may take 2-3 minutes...
python "C:\Users\pouya\Desktop\accounting\odoo\odoo-bin" -c "C:\Users\pouya\Desktop\accounting\odoo.conf" -d fmcg_shop -i base,account,stock,product,l10n_ir,fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount,fmcg_inventory,fmcg_persian,fmcg_offline,fmcg_pos_terminal,fmcg_reports --stop-after-init --without-demo=all

echo [4/4] Done!
echo.
echo Database 'fmcg_shop' has been reset with all modules installed.
echo You can now start the system with start.bat
goto :end

:fresh
echo.
set /p DBNAME=Enter new database name (e.g. shop2): 
if "%DBNAME%"=="" goto :cancel

echo.
echo [1/3] Creating database '%DBNAME%'...
set PGPASSWORD=odoo
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "CREATE DATABASE %DBNAME% OWNER odoo ENCODING 'UTF8';"
if errorlevel 1 (
    echo ERROR: Failed to create database. Check PostgreSQL is running.
    goto :end
)

echo [2/3] Installing modules on '%DBNAME%'...
echo This may take 2-3 minutes...
python "C:\Users\pouya\Desktop\accounting\odoo\odoo-bin" -c "C:\Users\pouya\Desktop\accounting\odoo.conf" -d %DBNAME% -i base,account,stock,product,l10n_ir,fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount --stop-after-init
if errorlevel 1 (
    echo ERROR: Module installation failed. Check the output above.
    goto :end
)

echo [3/3] Done!
echo.
echo Database '%DBNAME%' created with all modules.
echo To use it, update db_name in odoo.conf to: %DBNAME%
goto :end

:cancel
echo Cancelled.

:end
echo.
pause
