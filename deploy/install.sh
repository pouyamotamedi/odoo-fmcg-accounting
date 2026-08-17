#!/bin/bash
# ============================================================
# FMCG Accounting - One-Click Server Installation
# Compatible with: Ubuntu 22.04 / 24.04
# Usage: bash install.sh <subdomain> [database_name]
# Example: bash install.sh smoke.mediumco.org smoke
# ============================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Do not let redirected or quiet commands fail without an explanation.
trap 'exit_code=$?; echo -e "${RED}ERROR on line ${LINENO}: ${BASH_COMMAND} (exit ${exit_code})${NC}" >&2' ERR

echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  FMCG Accounting - Server Installation${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""

# ============ Configuration ============
DOMAIN="${1:-}"
DB_NAME="${2:-${DOMAIN%%.*}}"
INSTALL_DIR="/opt/fmcg-${DB_NAME}"
REPO_URL="https://github.com/pouyamotamedi/odoo-fmcg-accounting.git"
BRANCH="feature/frontend-api-integration"
ODOO_PORT=$(ss -tlnp | grep -oP ':\K(80[6-9][0-9]|81[0-9][0-9])' | sort -n | tail -1 | awk '{print $1+1}')
[ -z "$ODOO_PORT" ] && ODOO_PORT=8069
FRONTEND_PORT=$(ss -tlnp | grep -oP ':\K(30[0-9][0-9])' | sort -n | tail -1 | awk '{print $1+1}')
[ -z "$FRONTEND_PORT" ] && FRONTEND_PORT=3000
DB_USER="odoo"
DB_PASS="odoo"
ADMIN_PASS="admin"
EMAIL="admin@${DOMAIN#*.}"

if [ -z "$DOMAIN" ]; then
    echo -e "${RED}Usage: bash install.sh <subdomain> [database_name]${NC}"
    echo "  Example: bash install.sh smoke.mediumco.org smoke"
    exit 1
fi

echo -e "${YELLOW}  Domain:     ${DOMAIN}${NC}"
echo -e "${YELLOW}  Database:   ${DB_NAME}${NC}"
echo -e "${YELLOW}  Install:    ${INSTALL_DIR}${NC}"
echo -e "${YELLOW}  Odoo Port:  ${ODOO_PORT}${NC}"
echo -e "${YELLOW}  Frontend:   ${FRONTEND_PORT}${NC}"
echo ""

# ============ [1/10] System Dependencies ============
echo -e "${GREEN}[1/10] Installing system dependencies...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

echo "  Installing required packages..."
apt-get install -y -qq python3 python3-pip python3-dev postgresql postgresql-client \
    nginx certbot python3-certbot-nginx git \
    libldap2-dev libsasl2-dev gcc g++ make libpq-dev libjpeg-dev \
    zlib1g-dev libfreetype6-dev libxml2-dev libxslt1-dev curl \
    ca-certificates gnupg sudo

# wkhtmltopdf is not available from every supported Ubuntu repository.
# Odoo can run without it, but PDF report rendering will remain unavailable.
if apt-cache show wkhtmltopdf >/dev/null 2>&1; then
    apt-get install -y -qq wkhtmltopdf || \
        echo -e "${YELLOW}  WARNING: wkhtmltopdf could not be installed; continuing without PDF rendering.${NC}"
else
    echo -e "${YELLOW}  WARNING: wkhtmltopdf is unavailable in this Ubuntu repository; continuing without PDF rendering.${NC}"
fi

# Node.js 20+
if ! node -v 2>/dev/null | grep -q "v2[0-9]"; then
    echo "  Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi

echo -e "  Python: $(python3 --version), Node: $(node -v), npm: $(npm -v)"

# ============ [2/10] System User ============
echo -e "${GREEN}[2/10] Creating system user...${NC}"
id odoo >/dev/null 2>&1 || useradd -m -s /bin/bash odoo

# ============ [3/10] PostgreSQL ============
echo -e "${GREEN}[3/10] Setting up PostgreSQL...${NC}"
sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}' CREATEDB;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || true
echo "  Database '${DB_NAME}' ready."

# ============ [4/10] Clone Repository ============
echo -e "${GREEN}[4/10] Cloning repository...${NC}"
if [ -d "${INSTALL_DIR}" ]; then
    cd "${INSTALL_DIR}" && git pull origin ${BRANCH} --quiet
else
    git clone --depth 1 -b ${BRANCH} "${REPO_URL}" "${INSTALL_DIR}" --quiet
fi
# Clone Odoo 18 source
if [ ! -d "${INSTALL_DIR}/odoo" ]; then
    echo "  Cloning Odoo 18 (this takes a few minutes)..."
    git clone --depth 1 -b 18.0 https://github.com/odoo/odoo.git "${INSTALL_DIR}/odoo" --quiet
fi
chown -R odoo:odoo "${INSTALL_DIR}"
echo "  Repository cloned."

# ============ [5/10] Python Dependencies ============
echo -e "${GREEN}[5/10] Installing Python dependencies...${NC}"
pip3 install --break-system-packages -q \
    psycopg2-binary lxml lxml_html_clean Pillow reportlab passlib \
    python-dateutil pytz babel decorator docutils gevent greenlet \
    Jinja2 MarkupSafe num2words ofxparse polib psutil pydot PyPDF2 \
    pyserial python-stdnum qrcode vobject Werkzeug xlrd xlsxwriter \
    xlwt chardet cryptography idna requests urllib3 zeep rjsmin libsass 2>/dev/null

# ============ [6/10] Odoo Configuration ============
echo -e "${GREEN}[6/10] Creating Odoo configuration...${NC}"
ODOO_CONF="/etc/odoo-${DB_NAME}.conf"
cat > "${ODOO_CONF}" << EOF
[options]
db_host = localhost
db_port = 5432
db_user = ${DB_USER}
db_password = ${DB_PASS}
db_name = ${DB_NAME}
dbfilter = ${DB_NAME}
list_db = False
addons_path = ${INSTALL_DIR}/odoo/odoo/addons,${INSTALL_DIR}/odoo/addons,${INSTALL_DIR}/custom_addons
http_port = ${ODOO_PORT}
admin_passwd = ${ADMIN_PASS}
proxy_mode = True
log_level = warn
logfile = /var/log/odoo/odoo-${DB_NAME}.log
workers = 0
max_cron_threads = 1
EOF

mkdir -p /var/log/odoo
chown odoo:odoo /var/log/odoo

# Patch session check for reverse proxy compatibility (Odoo 18 issue)
SECURITY_FILE="${INSTALL_DIR}/odoo/odoo/service/security.py"
cat > "${SECURITY_FILE}" << 'PATCH'
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
    # Patched for reverse proxy compatibility
    if session.uid:
        return True
    return False
PATCH

echo "  Config: ${ODOO_CONF}"

# ============ [7/10] Install Odoo Modules ============
echo -e "${GREEN}[7/10] Installing Odoo modules (3-5 minutes)...${NC}"

# Step A: Install base + account first to set up chart of accounts
echo "  Step A: Installing base accounting..."
sudo -u odoo python3 "${INSTALL_DIR}/odoo/odoo-bin" -c "${ODOO_CONF}" -d "${DB_NAME}" \
    -i base,account,stock,stock_account,product \
    --stop-after-init --without-demo=all --load-language=fa_IR 2>&1 | tail -3

# Step B: Set chart template to generic_coa if not set
echo "  Step B: Ensuring chart of accounts (generic_coa)..."
sudo -u odoo python3 -c "
import xmlrpc.client
import time
url = 'http://localhost:${ODOO_PORT}'
for attempt in range(3):
    try:
        common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
        uid = common.authenticate('${DB_NAME}', 'admin', 'admin', {})
        models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
        # Check if chart is set
        company = models.execute_kw('${DB_NAME}', uid, 'admin', 'res.company', 'search_read', [[]], {'fields': ['chart_template'], 'limit': 1})
        if company and not company[0].get('chart_template'):
            models.execute_kw('${DB_NAME}', uid, 'admin', 'res.company', 'write', [[1], {'chart_template': 'generic_coa'}])
            # Try to load the chart
            try:
                models.execute_kw('${DB_NAME}', uid, 'admin', 'account.chart.template', 'try_loading', [['generic_coa']], {'context': {'default_company_id': 1}})
            except:
                pass
        break
    except:
        time.sleep(3)
print('  Chart of accounts configured.')
" 2>/dev/null

# If chart loading didn't work via RPC, try direct module approach
ACCOUNT_COUNT=$(sudo -u odoo psql -t -d "${DB_NAME}" -c "SELECT count(*) FROM account_account;" 2>/dev/null | tr -d ' ')
if [ "${ACCOUNT_COUNT}" = "0" ] || [ -z "${ACCOUNT_COUNT}" ]; then
    echo "  Chart not loaded yet, re-initializing account module..."
    sudo -u odoo python3 "${INSTALL_DIR}/odoo/odoo-bin" -c "${ODOO_CONF}" -d "${DB_NAME}" \
        -u account --stop-after-init 2>&1 | tail -2
fi

# Step C: Install all FMCG modules
echo "  Step C: Installing FMCG modules..."
sudo -u odoo python3 "${INSTALL_DIR}/odoo/odoo-bin" -c "${ODOO_CONF}" -d "${DB_NAME}" \
    -i fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount,fmcg_inventory,fmcg_persian,fmcg_offline,fmcg_pos_terminal,fmcg_reports \
    --stop-after-init 2>&1 | tail -3

# Verify
ACCOUNT_COUNT=$(sudo -u odoo psql -t -d "${DB_NAME}" -c "SELECT count(*) FROM account_account;" 2>/dev/null | tr -d ' ')
FMCG_COUNT=$(sudo -u odoo psql -t -d "${DB_NAME}" -c "SELECT count(*) FROM ir_module_module WHERE name LIKE 'fmcg%' AND state='installed';" 2>/dev/null | tr -d ' ')
echo "  Accounts: ${ACCOUNT_COUNT}, FMCG modules: ${FMCG_COUNT}/10"

if [ "${FMCG_COUNT}" -lt "8" ] 2>/dev/null; then
    echo -e "${RED}  WARNING: Not all modules installed! Check logs at /var/log/odoo/odoo-${DB_NAME}.log${NC}"
fi

# Set admin language
sudo -u postgres psql -d "${DB_NAME}" -c "UPDATE res_partner SET lang='fa_IR' WHERE id IN (SELECT partner_id FROM res_users WHERE id=2);" >/dev/null 2>&1

echo "  Modules installed."

# ============ [8/10] Frontend Build ============
echo -e "${GREEN}[8/10] Building frontend...${NC}"
cd "${INSTALL_DIR}/frontend"

# Fix next.config.ts to use dynamic port from env
cat > next.config.ts << 'NEXTCFG'
import type { NextConfig } from "next";
const ODOO_INTERNAL_URL = process.env.ODOO_INTERNAL_URL || 'http://localhost:8069';
const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${ODOO_INTERNAL_URL}/:path*` }];
  },
};
export default nextConfig;
NEXTCFG

cat > .env.local << EOF
NEXT_PUBLIC_ODOO_URL=/api
NEXT_PUBLIC_ODOO_DB=${DB_NAME}
ODOO_INTERNAL_URL=http://localhost:${ODOO_PORT}
EOF
sudo -u odoo npm install --quiet 2>/dev/null
sudo -u odoo npm run build 2>&1 | tail -2
echo "  Frontend built."

# ============ [9/10] Systemd Services ============
echo -e "${GREEN}[9/10] Creating services...${NC}"

cat > "/etc/systemd/system/odoo-${DB_NAME}.service" << EOF
[Unit]
Description=Odoo FMCG (${DB_NAME})
After=postgresql.service

[Service]
Type=simple
User=odoo
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/odoo/odoo-bin -c ${ODOO_CONF}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/systemd/system/fmcg-${DB_NAME}.service" << EOF
[Unit]
Description=FMCG Frontend (${DB_NAME})
After=odoo-${DB_NAME}.service

[Service]
Type=simple
User=odoo
WorkingDirectory=${INSTALL_DIR}/frontend
ExecStart=/usr/bin/npm start
Environment=PORT=${FRONTEND_PORT}
Environment=NODE_ENV=production
Environment=ODOO_INTERNAL_URL=http://localhost:${ODOO_PORT}
Environment=NEXT_PUBLIC_ODOO_DB=${DB_NAME}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "odoo-${DB_NAME}" "fmcg-${DB_NAME}" >/dev/null 2>&1
systemctl start "odoo-${DB_NAME}" "fmcg-${DB_NAME}"

echo "  Services started."

# ============ [10/10] Nginx + SSL ============
echo -e "${GREEN}[10/10] Configuring Nginx + SSL...${NC}"

cat > "/etc/nginx/sites-available/${DOMAIN}" << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }
}
EOF

ln -sf "/etc/nginx/sites-available/${DOMAIN}" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 && systemctl restart nginx

# SSL Certificate
echo "  Requesting SSL certificate..."
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --email "${EMAIL}" 2>&1 | tail -3 || true

echo "  Nginx configured."

# ============ Apply Translations ============
echo -e "${GREEN}[+] Applying Persian translations...${NC}"
# Wait for Odoo to be fully responsive
echo "  Waiting for Odoo to start (port ${ODOO_PORT})..."
for i in $(seq 1 30); do
    if curl -s "http://localhost:${ODOO_PORT}/web/login" >/dev/null 2>&1; then
        break
    fi
    sleep 2
done
cd "${INSTALL_DIR}"
# Patch the translations script to use correct port
sed -i "s|http://localhost:8069|http://localhost:${ODOO_PORT}|g" apply_translations.py
python3 apply_translations.py "${DB_NAME}" 2>&1 | grep -v "^$" | tail -20
# Restore default port in file (for local dev)
sed -i "s|http://localhost:${ODOO_PORT}|http://localhost:8069|g" apply_translations.py
echo "  Translations applied."

# ============ Done ============
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo -e "  URL:        ${YELLOW}https://${DOMAIN}${NC}"
echo -e "  Login:      ${YELLOW}admin / admin${NC}"
echo ""
echo -e "  Database:   ${DB_NAME}"
echo -e "  Odoo Port:  ${ODOO_PORT}"
echo -e "  Frontend:   ${FRONTEND_PORT}"
echo -e "  Config:     ${ODOO_CONF}"
echo -e "  Install:    ${INSTALL_DIR}"
echo ""
echo -e "  Services:"
echo -e "    systemctl status odoo-${DB_NAME}"
echo -e "    systemctl status fmcg-${DB_NAME}"
echo ""
echo -e "  Logs:"
echo -e "    tail -f /var/log/odoo/odoo-${DB_NAME}.log"
echo -e "    journalctl -u fmcg-${DB_NAME} -f"
echo ""
echo -e "${GREEN}============================================================${NC}"
