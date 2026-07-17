#!/bin/bash
# ============================================
# FMCG Accounting - Update Script
# Pulls latest code from GitHub without touching data
# ============================================

set -e

INSTALL_DIR="/opt/fmcg-accounting"
BRANCH="feature/frontend-api-integration"

echo "============================================"
echo "  FMCG Update - Pulling latest changes"
echo "============================================"
echo ""

cd "$INSTALL_DIR"

# Step 1: Pull latest code
echo "[1/4] Pulling from GitHub..."
sudo -u odoo git fetch origin
sudo -u odoo git reset --hard origin/$BRANCH

# Step 2: Update Odoo modules (without losing data)
echo "[2/4] Updating Odoo modules..."
systemctl stop odoo
sudo -u odoo python3 "$INSTALL_DIR/odoo/odoo-bin" -c /etc/odoo.conf \
  -u fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount \
  --stop-after-init
systemctl start odoo

# Step 3: Rebuild frontend
echo "[3/4] Rebuilding frontend..."
systemctl stop fmcg-frontend
cd "$INSTALL_DIR/frontend"
sudo -u odoo npm install
sudo -u odoo npm run build
systemctl start fmcg-frontend

# Step 4: Done
echo "[4/4] Update complete!"
echo ""
echo "  Services restarted."
echo "  Data is safe - only code was updated."
echo ""
echo "============================================"
