@echo off
chcp 65001 >nul
title FMCG - Switch Business
echo ============================================
echo   Switch Between Businesses
echo ============================================
echo.
echo   Available databases:
echo   --------------------
set PGPASSWORD=odoo
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -t -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres' ORDER BY datname;"
echo.
echo   --------------------
echo.
echo   Current: 
type "C:\Users\pouya\Desktop\accounting\frontend\.env.local" | findstr ODOO_DB
echo.

set /p DBNAME=Switch to database: 
if "%DBNAME%"=="" (
    echo Cancelled.
    pause
    exit /b
)

powershell -Command "(Get-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf') -replace 'db_name = .*', 'db_name = %DBNAME%' | Set-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf'"

echo NEXT_PUBLIC_ODOO_URL=/api> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"
echo NEXT_PUBLIC_ODOO_DB=%DBNAME%>> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"

echo.
echo ============================================
echo   Switched to: %DBNAME%
echo   Restart start.bat to apply.
echo ============================================
echo.
pause
