@echo off
title FMCG - New Business Setup
echo ============================================
echo   ایجاد کسب‌وکار جدید
echo ============================================
echo.
echo   این ابزار یک نسخه کاملا تمیز و جدید از
echo   نرم‌افزار ایجاد میکند (بدون هیچ داده‌ای)
echo.
echo   ماژول‌ها خودکار نصب میشوند.
echo   فقط اسم دیتابیس را وارد کنید.
echo.
echo ============================================
echo.

set /p DBNAME=نام دیتابیس (انگلیسی، بدون فاصله. مثلا: shop_ali): 
if "%DBNAME%"=="" (
    echo نام وارد نشد. لغو شد.
    pause
    exit /b
)

echo.
echo [1/5] ایجاد دیتابیس '%DBNAME%'...
set PGPASSWORD=odoo
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "CREATE DATABASE %DBNAME% OWNER odoo ENCODING 'UTF8';" 2>nul
if errorlevel 1 (
    echo.
    echo خطا: دیتابیس قبلا وجود دارد یا PostgreSQL در حال اجرا نیست.
    echo اگر میخواهید دیتابیس موجود را پاک و از اول بسازید:
    set /p DROPCONFIRM=آیا دیتابیس '%DBNAME%' حذف و بازسازی شود؟ (YES/NO): 
    if /i "!DROPCONFIRM!"=="YES" (
        "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='%DBNAME%';" 2>nul
        "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "DROP DATABASE %DBNAME%;"
        "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U odoo -h localhost -d postgres -c "CREATE DATABASE %DBNAME% OWNER odoo ENCODING 'UTF8';"
    ) else (
        echo لغو شد.
        pause
        exit /b
    )
)

echo [2/5] نصب ماژول‌ها (ممکن است ۲-۳ دقیقه طول بکشد)...
python "C:\Users\pouya\Desktop\accounting\odoo\odoo-bin" -c "C:\Users\pouya\Desktop\accounting\odoo.conf" -d %DBNAME% -i base,account,stock,product,l10n_ir,fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount --stop-after-init --without-demo=all
if errorlevel 1 (
    echo خطا در نصب ماژول‌ها!
    pause
    exit /b
)

echo [3/5] تنظیم odoo.conf روی دیتابیس جدید...
powershell -Command "(Get-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf') -replace 'db_name = .*', 'db_name = %DBNAME%' | Set-Content 'C:\Users\pouya\Desktop\accounting\odoo.conf'"

echo [4/5] تنظیم frontend روی دیتابیس جدید...
echo NEXT_PUBLIC_ODOO_URL=/api> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"
echo NEXT_PUBLIC_ODOO_DB=%DBNAME%>> "C:\Users\pouya\Desktop\accounting\frontend\.env.local"

echo [5/5] تمام!
echo.
echo ============================================
echo   کسب‌وکار جدید '%DBNAME%' آماده است!
echo ============================================
echo.
echo   حالا start.bat را اجرا کنید.
echo.
echo   نام کاربری: admin
echo   رمز عبور: admin
echo.
echo   نکته: برای برگشت به دیتابیس قبلی،
echo   odoo.conf و .env.local را ویرایش کنید.
echo ============================================
echo.
pause
