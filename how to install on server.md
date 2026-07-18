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