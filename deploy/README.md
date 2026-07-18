# FMCG Accounting - Deployment Guide

## One-Click Install (New Server)

```bash
# SSH into your Ubuntu 22.04+ server
ssh root@YOUR_SERVER_IP

# Download and run the installer
curl -sSL https://raw.githubusercontent.com/pouyamotamedi/odoo-fmcg-accounting/feature/frontend-api-integration/deploy/install.sh -o install.sh
bash install.sh YOUR_SUBDOMAIN.example.com [database_name]
```

### Example:
```bash
bash install.sh smoke.mediumco.org smoke
bash install.sh shop2.mediumco.org shop2
```

### What it does automatically:
1. Installs all system dependencies (Python, Node.js, PostgreSQL, Nginx)
2. Creates PostgreSQL database
3. Clones the repo + Odoo 18 source
4. Installs all Python packages
5. Installs all FMCG modules + Persian language
6. Builds Next.js frontend
7. Creates systemd services (auto-start on boot)
8. Configures Nginx reverse proxy
9. Gets SSL certificate (Let's Encrypt)
10. Applies Persian translations (accounts, journals, categories)

### Requirements:
- Ubuntu 22.04 or 24.04
- Minimum 2 CPU, 4GB RAM, 40GB disk
- Domain/subdomain DNS pointing to server IP
- Root access

---

## Update (Pull latest changes)

```bash
bash /opt/fmcg-smoke/deploy/update.sh smoke
```

Or use the **Update button** in Settings page.

What it does:
- Pulls latest code from GitHub
- Re-applies security patch
- Updates Odoo modules (data preserved)
- Rebuilds frontend

---

## Backup

### Setup daily automatic backup:
```bash
echo "0 3 * * * /opt/fmcg-smoke/deploy/backup.sh smoke" | crontab -
```

### Manual backup:
```bash
bash /opt/fmcg-smoke/deploy/backup.sh smoke
```

### Restore:
```bash
systemctl stop odoo-smoke
gunzip < /opt/fmcg-backups/smoke/db_2024-01-15_03-00.sql.gz | psql -U odoo smoke
systemctl start odoo-smoke
```

---

## Multi-Store Setup

Each store gets its own:
- Database
- Odoo instance (separate port)
- Frontend instance (separate port)
- Nginx config
- SSL certificate

Just run `install.sh` again with a different subdomain:
```bash
bash install.sh store1.mediumco.org store1
bash install.sh store2.mediumco.org store2
```

---

## Management Commands

```bash
# Status
systemctl status odoo-smoke
systemctl status fmcg-smoke

# Restart
systemctl restart odoo-smoke fmcg-smoke

# Logs
tail -f /var/log/odoo/odoo-smoke.log
journalctl -u fmcg-smoke -f

# Odoo shell (for debugging)
sudo -u odoo python3 /opt/fmcg-smoke/odoo/odoo-bin shell -c /etc/odoo-smoke.conf
```

---

## File Structure (per store)

```
/opt/fmcg-smoke/
├── odoo/              # Odoo 18 source
├── custom_addons/     # FMCG modules
├── frontend/          # Next.js app
├── deploy/            # Scripts
├── apply_translations.py
└── ...

/etc/odoo-smoke.conf           # Odoo config
/etc/nginx/sites-available/    # Nginx configs
/opt/fmcg-backups/smoke/       # Backups
/var/log/odoo/                 # Logs
```

---

## Default Credentials

- **Frontend**: admin / admin
- **Odoo Backend**: admin / admin (port varies)
- **PostgreSQL**: odoo / odoo
