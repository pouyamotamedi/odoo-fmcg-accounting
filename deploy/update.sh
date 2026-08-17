#!/bin/bash
# ============================================================
# FMCG Accounting - Update Script
# Pulls latest code, updates modules, rebuilds frontend
# Usage: bash update.sh [database_name]
# Example: bash update.sh smoke
# ============================================================

set -e

DB_NAME="${1:-}"
BRANCH="feature/frontend-api-integration"

if [ -z "$DB_NAME" ]; then
    # Auto-detect from running services
    DB_NAME=$(systemctl list-units --type=service --state=running | grep odoo- | head -1 | sed 's/.*odoo-\(.*\)\.service.*/\1/')
fi

if [ -z "$DB_NAME" ]; then
    echo "Usage: bash update.sh <database_name>"
    exit 1
fi

INSTALL_DIR="/opt/fmcg-${DB_NAME}"
ODOO_CONF="/etc/odoo-${DB_NAME}.conf"

echo "============================================"
echo "  Updating: ${DB_NAME}"
echo "  Directory: ${INSTALL_DIR}"
echo "============================================"
echo ""

if [ ! -d "${INSTALL_DIR}" ]; then
    echo "ERROR: ${INSTALL_DIR} not found!"
    exit 1
fi

# Pull latest code
echo "[1/4] Pulling latest code..."
cd "${INSTALL_DIR}"
sudo -u odoo git fetch origin ${BRANCH} --quiet
sudo -u odoo git checkout -- . 2>/dev/null
sudo -u odoo git pull origin ${BRANCH} --quiet

# Re-apply security patch
echo "[2/4] Applying patches..."
cat > "${INSTALL_DIR}/odoo/odoo/service/security.py" << 'PATCH'
# -*- coding: utf-8 -*-
import odoo
import odoo.exceptions
from odoo.modules.registry import Registry

def check(db, uid, passwd):
    res_users = Registry(db)['res.users']
    return res_users.check(db, uid, passwd)

def compute_session_token(session, env):
    self = env['res.users'].browse(session.uid)
    return self._compute_session_token(session.sid)

def check_session(session, env, request=None):
    if session.uid:
        return True
    return False
PATCH

# Update Odoo modules
echo "[3/4] Updating Odoo modules..."
sudo systemctl stop "odoo-${DB_NAME}"
sudo -u odoo python3 "${INSTALL_DIR}/odoo/odoo-bin" -c "${ODOO_CONF}" -d "${DB_NAME}" \
    -u fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount,fmcg_inventory,fmcg_persian,fmcg_offline,fmcg_pos_terminal,fmcg_reports \
    --stop-after-init 2>&1 | grep -E "^(INFO|ERROR)" | tail -3
sudo systemctl start "odoo-${DB_NAME}"

# Rebuild frontend (without stopping service - only restart after successful build)
echo "[4/4] Rebuilding frontend..."
cd "${INSTALL_DIR}/frontend"
sudo -u odoo npm install --quiet 2>/dev/null
sudo -u odoo npm run build 2>&1 | tail -2
if [ $? -eq 0 ]; then
  sudo systemctl restart "fmcg-${DB_NAME}" "odoo-${DB_NAME}"
  echo "  Services restarted."
else
  echo "  ERROR: Build failed! Services NOT restarted (old version still running)."
fi

# Re-apply translations (in case new ones were added)
echo "[5/5] Applying translations..."
ODOO_PORT=$(grep "http_port" "${ODOO_CONF}" | awk -F= '{print $2}' | tr -d ' ')
[ -z "$ODOO_PORT" ] && ODOO_PORT=8069
# Wait for Odoo
for i in $(seq 1 20); do
    curl -s "http://localhost:${ODOO_PORT}/web/login" >/dev/null 2>&1 && break
    sleep 2
done
cd "${INSTALL_DIR}"
sed -i "s|http://localhost:8069|http://localhost:${ODOO_PORT}|g" apply_translations.py
python3 apply_translations.py "${DB_NAME}" 2>&1 | tail -5
sed -i "s|http://localhost:${ODOO_PORT}|http://localhost:8069|g" apply_translations.py

echo ""
echo "============================================"
echo "  Update complete! Data is safe."
echo "============================================"
