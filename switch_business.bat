@echo off
title FMCG - Switch Business
echo ============================================
echo   جابجایی بین کسب‌وکارها
echo ============================================
echo.

echo   دیتابیس‌های موجود:
echo   -------------------
set PGPASSWORD=odoo
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -t -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres' ORDER BY datname;"
echo.
echo   -------------------
echo.

set /p DBNAME=نام دیتابیس مقصد: 
if "%DBNAME%"=="" (
    echo لغو شد.
    pause
    exit /b
)

echo.
echo تغییر به '%DBNAME%'...

powershell -Command "(Get-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf') -replace 'db_name = .*', 'db_name = %DBNAME%' | Set-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf'"

echo NEXT_PUBLIC_ODOO_URL=/api> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"
echo NEXT_PUBLIC_ODOO_DB=%DBNAME%>> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"

echo.
echo ============================================
echo   سوئیچ انجام شد: %DBNAME%
echo   حالا start.bat را مجدد اجرا کنید.
echo ============================================
echo.
pause
