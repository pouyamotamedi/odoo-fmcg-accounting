# FMCG Accounting - Deployment Guide

## Requirements
- Ubuntu 22.04+ (or any Debian-based Linux)
- Minimum: 2 CPU, 4GB RAM, 40GB SSD
- Root access

## Quick Install (New Server)

```bash
# 1. SSH into server
ssh root@YOUR_SERVER_IP

# 2. Download and run installer
git clone -b feature/frontend-api-integration https://github.com/pouyamotamedi/odoo-fmcg-accounting.git /opt/fmcg-accounting
cd /opt/fmcg-accounting/deploy
chmod +x install.sh update.sh backup.sh setup-cron.sh
./install.sh
```

## After Installation

- Frontend: `http://YOUR_IP:3000`
- Odoo Backend: `http://YOUR_IP:8069`
- Admin login: `admin` / `admin`

## Update (Pull latest code)

```bash
cd /opt/fmcg-accounting/deploy
./update.sh
```

Or use the **Update button** in Settings page.

## Backup

### Automatic (recommended)
```bash
./setup-cron.sh
```
Runs daily at 3:00 AM. Keeps 30 days of backups in `/opt/fmcg-backups/`.

### Manual
```bash
./backup.sh
```

### Restore from backup
```bash
# Stop Odoo
systemctl stop odoo

# Restore database
gunzip < /opt/fmcg-backups/db_fmcg_shop_2024-01-15_03-00.sql.gz | psql -U odoo fmcg_shop

# Start Odoo
systemctl start odoo
```

## Multi-Store Setup

For each new store, create a separate database:

```bash
# Create new database
sudo -u postgres psql -c "CREATE DATABASE store2 OWNER odoo;"

# Install modules on new database
python3 /opt/fmcg-accounting/odoo/odoo-bin -c /etc/odoo.conf -d store2 \
  -i base,account,stock,product,l10n_ir,fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount \
  --stop-after-init
```

Then update the frontend `.env` or use different ports per store.

## File Structure

```
/opt/fmcg-accounting/
├── odoo/              # Odoo source
├── custom_addons/     # Our Python modules
├── frontend/          # Next.js frontend
├── deploy/            # Deployment scripts
│   ├── install.sh     # Initial server setup
│   ├── update.sh      # Update from GitHub
│   ├── backup.sh      # Database backup
│   └── setup-cron.sh  # Setup daily backup
├── odoo.conf          # Local development config
└── start.bat          # Windows development startup
```

## Services

```bash
systemctl status odoo
systemctl status fmcg-frontend
systemctl restart odoo
systemctl restart fmcg-frontend
```

## Logs

```bash
tail -f /var/log/odoo/odoo.log
journalctl -u fmcg-frontend -f
```
