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

if [[ ! "${DB_NAME}" =~ ^[a-z][a-z0-9_-]{0,62}$ ]]; then
    echo "ERROR: Invalid database name: ${DB_NAME}"
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
bash "${INSTALL_DIR}/deploy/configure_restore_permissions.sh" "${DB_NAME}"

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

# Install required feature modules before upgrading them.
echo "[3/6] Ensuring required Odoo modules are installed..."
sudo systemctl stop "odoo-${DB_NAME}"
for REQUIRED_MODULE in fmcg_sales_incentive fmcg_boost; do
    MODULE_STATE=$(sudo -u postgres psql -d "${DB_NAME}" -tAc "SELECT state FROM ir_module_module WHERE name='${REQUIRED_MODULE}' LIMIT 1" 2>/dev/null || true)
    if [ "${MODULE_STATE}" != "installed" ]; then
        echo "  Current state: ${MODULE_STATE:-missing}; installing ${REQUIRED_MODULE}..."
        if ! sudo -u odoo python3 "${INSTALL_DIR}/odoo/odoo-bin" -c "${ODOO_CONF}" -d "${DB_NAME}" \
            -i "${REQUIRED_MODULE}" --stop-after-init --without-demo=all; then
            echo "ERROR: ${REQUIRED_MODULE} installation failed."
            sudo systemctl start "odoo-${DB_NAME}"
            exit 1
        fi
    fi
done

# Upgrade all custom modules only after required feature modules exist.
echo "[4/6] Upgrading Odoo modules..."
MODULES="fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount,fmcg_inventory,fmcg_persian,fmcg_offline,fmcg_pos_terminal,fmcg_reports,fmcg_sales_incentive,fmcg_boost"
if ! sudo -u odoo python3 "${INSTALL_DIR}/odoo/odoo-bin" -c "${ODOO_CONF}" -d "${DB_NAME}" \
    -u "${MODULES}" --stop-after-init --without-demo=all; then
    echo "ERROR: Odoo module upgrade failed."
    sudo systemctl start "odoo-${DB_NAME}"
    exit 1
fi

INCENTIVE_STATE=$(sudo -u postgres psql -d "${DB_NAME}" -tAc "SELECT state FROM ir_module_module WHERE name='fmcg_sales_incentive' LIMIT 1" 2>/dev/null || true)
BOOST_STATE=$(sudo -u postgres psql -d "${DB_NAME}" -tAc "SELECT state FROM ir_module_module WHERE name='fmcg_boost' LIMIT 1" 2>/dev/null || true)
INCENTIVE_MODEL_COUNT=$(sudo -u postgres psql -d "${DB_NAME}" -tAc "SELECT count(*) FROM ir_model WHERE model='fmcg.incentive.period'" 2>/dev/null || echo 0)
BOOST_MODEL_COUNT=$(sudo -u postgres psql -d "${DB_NAME}" -tAc "SELECT count(*) FROM ir_model WHERE model='fmcg.boost.config'" 2>/dev/null || echo 0)
if [ "${INCENTIVE_STATE}" != "installed" ] || [ "${INCENTIVE_MODEL_COUNT}" != "1" ]; then
    echo "ERROR: Incentive verification failed (module=${INCENTIVE_STATE:-missing}, model_count=${INCENTIVE_MODEL_COUNT})."
    sudo systemctl start "odoo-${DB_NAME}"
    exit 1
fi
if [ "${BOOST_STATE}" != "installed" ] || [ "${BOOST_MODEL_COUNT}" != "1" ]; then
    echo "ERROR: Boost verification failed (module=${BOOST_STATE:-missing}, model_count=${BOOST_MODEL_COUNT})."
    sudo systemctl start "odoo-${DB_NAME}"
    exit 1
fi
sudo systemctl start "odoo-${DB_NAME}"

# Rebuild frontend with explicit instance-specific build settings.
echo "[5/6] Rebuilding frontend..."
ODOO_PORT=$(grep "http_port" "${ODOO_CONF}" | awk -F= '{print $2}' | tr -d ' ')
[ -z "$ODOO_PORT" ] && ODOO_PORT=8069
cd "${INSTALL_DIR}/frontend"
cat > .env.local << EOF
NEXT_PUBLIC_ODOO_URL=/api
NEXT_PUBLIC_ODOO_DB=${DB_NAME}
ODOO_INTERNAL_URL=http://localhost:${ODOO_PORT}
EOF
sudo chown odoo:odoo .env.local
sudo -u odoo npm install --quiet 2>/dev/null
if sudo -u odoo npm run build; then
  sudo systemctl restart "fmcg-${DB_NAME}" "odoo-${DB_NAME}"
  echo "  Services restarted."
else
  echo "  ERROR: Build failed! Services NOT restarted (old version still running)."
  exit 1
fi

# Verify the exact RPC used by the incentives page through the Next.js proxy.
echo "[6/6] Verifying login, dashboard and incentive RPC..."
FRONTEND_PORT=$(systemctl show "fmcg-${DB_NAME}" -p Environment --value | grep -oE 'PORT=[0-9]+' | head -1 | cut -d= -f2)
[ -z "$FRONTEND_PORT" ] && FRONTEND_PORT=3000
for i in $(seq 1 30); do
    curl -s "http://localhost:${FRONTEND_PORT}/login" >/dev/null 2>&1 && break
    sleep 2
done
if ! sudo -u odoo python3 "${INSTALL_DIR}/deploy/verify_incentives.py" \
    --base-url "http://localhost:${FRONTEND_PORT}/api" --database "${DB_NAME}"; then
    echo "ERROR: Post-deploy RPC verification failed. Update is NOT complete."
    exit 1
fi

# Re-apply translations (in case new ones were added)
echo "[+] Applying translations..."
# ODOO_PORT was resolved before the frontend build.
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
