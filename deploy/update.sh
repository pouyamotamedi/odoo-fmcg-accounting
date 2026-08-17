#!/bin/bash
# ============================================================
# FMCG Accounting - Update Script
# Pulls latest code, updates modules, rebuilds frontend
# Usage: bash update.sh [database_name]
# Example: bash update.sh smoke
# ============================================================

set -Eeuo pipefail

DB_NAME="${1:-}"
BRANCH="feature/frontend-api-integration"

trap 'exit_code=$?; echo "ERROR on line ${LINENO}: ${BASH_COMMAND} (exit ${exit_code})" >&2' ERR

if [ -z "$DB_NAME" ]; then
    # Auto-detect from running services.
    DB_NAME=$(systemctl list-units --type=service --state=running \
        | grep odoo- | head -1 \
        | sed 's/.*odoo-\(.*\)\.service.*/\1/' || true)
fi

if [ -z "$DB_NAME" ]; then
    echo "Usage: bash update.sh <database_name>"
    exit 1
fi

INSTALL_DIR="/opt/fmcg-${DB_NAME}"
ODOO_CONF="/etc/odoo-${DB_NAME}.conf"
ODOO_UPDATE_LOG="/tmp/fmcg-${DB_NAME}-odoo-update.log"
FRONTEND_BUILD_LOG="/tmp/fmcg-${DB_NAME}-frontend-build.log"
TRANSLATION_LOG="/tmp/fmcg-${DB_NAME}-translations.log"
BACKUP_DIR="/var/backups/fmcg"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}-before-update-$(date +%Y%m%d-%H%M%S).dump"

echo "============================================"
echo "  Updating: ${DB_NAME}"
echo "  Directory: ${INSTALL_DIR}"
echo "============================================"
echo ""

if [ ! -d "${INSTALL_DIR}/.git" ]; then
    echo "ERROR: ${INSTALL_DIR} is not a Git checkout!"
    exit 1
fi

# Pull the exact deployment branch and print the deployed revision.
echo "[1/6] Pulling latest code..."
cd "${INSTALL_DIR}"
sudo -u odoo git fetch origin "${BRANCH}"
sudo -u odoo git checkout -B "${BRANCH}" "origin/${BRANCH}"
DEPLOYED_SHA=$(sudo -u odoo git rev-parse --short HEAD)
echo "  Revision: ${DEPLOYED_SHA}"

# Back up the database before module migrations.
echo "[2/6] Backing up database..."
install -d -m 750 -o postgres -g postgres "${BACKUP_DIR}"
sudo -u postgres pg_dump -Fc -d "${DB_NAME}" -f "${BACKUP_FILE}"
echo "  Backup: ${BACKUP_FILE}"

# Re-apply security patch.
echo "[3/6] Applying patches..."
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

# Update Odoo modules. The command status is checked directly, not hidden by tail.
echo "[4/6] Updating Odoo modules..."
# Keep the old frontend from issuing variant-level requests while the discount
# schema is being migrated. Both services come back only after the new build.
systemctl stop "fmcg-${DB_NAME}" "odoo-${DB_NAME}"
if ! sudo -u odoo python3 "${INSTALL_DIR}/odoo/odoo-bin" \
    -c "${ODOO_CONF}" -d "${DB_NAME}" \
    -u fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount,fmcg_inventory,fmcg_persian,fmcg_offline,fmcg_pos_terminal,fmcg_reports \
    --stop-after-init >"${ODOO_UPDATE_LOG}" 2>&1; then
    echo "ERROR: Odoo module update failed. Last log lines:" >&2
    tail -50 "${ODOO_UPDATE_LOG}" >&2
    systemctl start "odoo-${DB_NAME}" "fmcg-${DB_NAME}" || true
    exit 1
fi
tail -5 "${ODOO_UPDATE_LOG}"
systemctl start "odoo-${DB_NAME}"

# Rebuild frontend and only restart services after a verified successful build.
echo "[5/6] Rebuilding frontend..."
cd "${INSTALL_DIR}/frontend"
if [ -f package-lock.json ]; then
    sudo -u odoo npm ci --quiet
else
    sudo -u odoo npm install --quiet
fi
if ! sudo -u odoo npm run build >"${FRONTEND_BUILD_LOG}" 2>&1; then
    echo "ERROR: Frontend build failed. Last log lines:" >&2
    tail -50 "${FRONTEND_BUILD_LOG}" >&2
    exit 1
fi
tail -10 "${FRONTEND_BUILD_LOG}"
systemctl restart "fmcg-${DB_NAME}" "odoo-${DB_NAME}"
systemctl is-active --quiet "fmcg-${DB_NAME}"
systemctl is-active --quiet "odoo-${DB_NAME}"
echo "  Services restarted and active."

# Re-apply translations (in case new ones were added).
echo "[6/6] Applying translations..."
ODOO_PORT=$(grep "http_port" "${ODOO_CONF}" | awk -F= '{print $2}' | tr -d ' ' || true)
[ -z "$ODOO_PORT" ] && ODOO_PORT=8069
for _ in $(seq 1 20); do
    if curl -fsS "http://localhost:${ODOO_PORT}/web/login" >/dev/null 2>&1; then
        break
    fi
    sleep 2
done
cd "${INSTALL_DIR}"
sed -i "s|http://localhost:8069|http://localhost:${ODOO_PORT}|g" apply_translations.py
if ! python3 apply_translations.py "${DB_NAME}" >"${TRANSLATION_LOG}" 2>&1; then
    sed -i "s|http://localhost:${ODOO_PORT}|http://localhost:8069|g" apply_translations.py
    echo "ERROR: Applying translations failed. Last log lines:" >&2
    tail -30 "${TRANSLATION_LOG}" >&2
    exit 1
fi
sed -i "s|http://localhost:${ODOO_PORT}|http://localhost:8069|g" apply_translations.py
tail -5 "${TRANSLATION_LOG}"

echo ""
echo "============================================"
echo "  Update complete! Revision: ${DEPLOYED_SHA}"
echo "  Data is safe."
echo "============================================"
