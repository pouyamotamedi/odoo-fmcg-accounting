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