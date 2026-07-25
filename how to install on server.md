حالا update script رو هم آپدیت کنم:Backup script:حالا README آپدیت:حالا security patch رو هم تو repo commit کنم و push:تموم شد! ✅ **بسته نصب آسان** آماده و push شد.

---

## نحوه استفاده:

### نصب فروشگاه جدید (یک خط!):
```bash
ssh root@45.129.38.101
ME0s89Dl0WWsX5e
ssh root@YOUR_SERVER_IP
curl -sSL https://raw.githubusercontent.com/pouyamotamedi/odoo-fmcg-accounting/feature/frontend-api-integration/deploy/install.sh -o install.sh
bash install.sh smoke.mediumco.org smoke
```

### نصب فروشگاه دوم:
```bash
bash install.sh shop2.mediumco.org shop2
```

---

## چی انجام میده (اتوماتیک):

| مرحله | عملیات |
|--------|---------|
| 1 | نصب Python, Node.js, PostgreSQL, Nginx |
| 2 | ساخت user سیستمی |
| 3 | ساخت database |
| 4 | Clone repo + Odoo 18 |
| 5 | نصب pip packages |
| 6 | ساخت config + security patch |
| 7 | نصب همه ماژول‌ها + زبان فارسی |
| 8 | Build frontend |
| 9 | ساخت services (auto-start) |
| 10 | Nginx + SSL (Let's Encrypt) |
| + | اعمال ترجمه‌ها (سرفصل‌ها، journal ها، دسته‌بندی‌ها) |

---

## بروزرسانی:
```bash
bash /opt/fmcg-smoke/deploy/update.sh smoke
bash /opt/fmcg-shop1/deploy/update.sh shop1
```

## بکاپ روزانه:
```bash
echo "0 3 * * * /opt/fmcg-smoke/deploy/backup.sh smoke" | crontab -
```


## پاک کردن

برای حذف کامل یه فروشگاه از سرور، این دستورها رو اجرا کن:

```bash
# مثلاً حذف فروشگاه "t"
DB_NAME="t"
DB_NAME="shop1"

# 1. Stop services
systemctl stop odoo-${DB_NAME} fmcg-${DB_NAME}
systemctl disable odoo-${DB_NAME} fmcg-${DB_NAME}

# 2. Remove service files
rm -f /etc/systemd/system/odoo-${DB_NAME}.service
rm -f /etc/systemd/system/fmcg-${DB_NAME}.service
systemctl daemon-reload

# 3. Drop database
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();"
sudo -u postgres psql -c "DROP DATABASE ${DB_NAME};"

# 4. Remove files
rm -rf /opt/fmcg-${DB_NAME}

# 5. Remove Odoo config
rm -f /etc/odoo-${DB_NAME}.conf

# 6. Remove nginx config
rm -f /etc/nginx/sites-enabled/t.mediumco.org
rm -f /etc/nginx/sites-available/t.mediumco.org
systemctl restart nginx

# 7. Remove logs
rm -f /var/log/odoo/odoo-${DB_NAME}.log
```

یا اگه میخوای یه script آماده داشته باشی بگو بسازم.


bash install.sh shop1.mediumco.org shop1





## ایجاد سال مالی
ترتیب کارها در صفحه سال مالی:

**۱. ایجاد سال مالی جدید**
- دکمه "سال جدید" رو بزن
- نام: مثلاً "سال مالی ۱۴۰۴"
- تاریخ شروع: ۱۴۰۴/۰۱/۰۱
- تاریخ پایان: ۱۴۰۴/۱۲/۲۹
- ایجاد

**۲. ثبت سند افتتاحیه (اول دوره)**
- دکمه "سند افتتاحیه" رو بزن
- مرحله ۱: حساب‌های مالی
  - تاریخ سند = اولین روز سال مالی (مثلاً ۱۴۰۴/۰۱/۰۱)
  - **بدهکار** (دارایی‌ها): صندوق نقدی، بانک، بدهکاران (+ انتخاب شخص)، پیش‌پرداخت‌ها
  - **بستانکار** (بدهی + سرمایه): بستانکاران (+ انتخاب شخص)، وام، سرمایه/آورده شرکا
  - مطمئن شو سند تراز باشه (بدهکار = بستانکار)
- مرحله ۲: موجودی کالا
  - کالاها رو انتخاب کن، تعداد و قیمت تمام‌شده هر واحد رو بزن
  - ارزش کل موجودی خودکار به بدهکار سند اضافه میشه
- مرحله ۳: بررسی و ثبت نهایی
  - چک کن همه‌چی درسته و ثبت کن

**۳. فعالیت‌های طی سال**
- فروش، خرید، هزینه‌ها، دریافت‌ها و پرداخت‌ها ثبت میشن

**۴. بستن سال مالی (آخر دوره)**
- کنار سال مالی دکمه "بستن" رو بزن
- سیستم سود/زیان خالص رو محاسبه و نشون میده
- حساب "سود انباشته" رو انتخاب کن
- تأیید → سند بستن ثبت میشه + دفاتر قفل میشن
- بعد از قفل، دیگه نمیتونی سند در اون سال ثبت کنی

**۵. سال بعد**
- سال مالی جدید بساز + سند افتتاحیه جدید (با مانده‌های انتقالی از سال قبل)

---

**نکته مهم:** قفل دفاتر (بخش بالای صفحه) یه ابزار مستقله. اگه بخوای بدون اجرای سند بستن، فقط جلوی ثبت سند قبل از یه تاریخ مشخص رو بگیری، از اونجا استفاده کن.