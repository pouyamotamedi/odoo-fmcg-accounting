#!/bin/bash
# ============================================
# FMCG Accounting - Server Installation Script
# Tested on Ubuntu 22.04 / 24.04
# ============================================

set -e

echo "============================================"
echo "  FMCG Accounting - Server Setup"
echo "============================================"
echo ""

# Configuration
INSTALL_DIR="/opt/fmcg-accounting"
DB_NAME="fmcg_shop"
DB_USER="odoo"
DB_PASS="odoo"
ODOO_PORT=8069
FRONTEND_PORT=3000
REPO_URL="https://github.com/pouyamotamedi/odoo-fmcg-accounting.git"
BRANCH="feature/frontend-api-integration"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

echo "[1/8] Installing system dependencies..."
apt update
apt install -y python3 python3-pip python3-venv python3-dev \
  postgresql postgresql-client \
  nodejs npm \
  nginx certbot python3-certbot-nginx \
  git wkhtmltopdf libldap2-dev libsasl2-dev \
  gcc g++ make libpq-dev libjpeg-dev zlib1g-dev

# Install Node.js 20 if needed
if ! node -v | grep -q "v20\|v21\|v22"; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

echo "[2/8] Creating system user..."
useradd -m -s /bin/bash odoo 2>/dev/null || true

echo "[3/8] Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS' CREATEDB;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true

echo "[4/8] Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
  cd "$INSTALL_DIR"
  git pull origin $BRANCH
else
  git clone -b $BRANCH "$REPO_URL" "$INSTALL_DIR"
fi
chown -R odoo:odoo "$INSTALL_DIR"

echo "[5/8] Setting up Odoo..."
cd "$INSTALL_DIR"
# Install Odoo Python dependencies
pip3 install -r odoo/requirements.txt 2>/dev/null || pip3 install psycopg2-binary lxml Pillow reportlab passlib python-dateutil pytz

# Create server odoo.conf
cat > /etc/odoo.conf << EOF
[options]
db_host = localhost
db_port = 5432
db_user = $DB_USER
db_password = $DB_PASS
db_name = $DB_NAME
addons_path = $INSTALL_DIR/odoo/odoo/addons,$INSTALL_DIR/odoo/addons,$INSTALL_DIR/custom_addons
http_port = $ODOO_PORT
admin_passwd = admin
log_level = warn
logfile = /var/log/odoo/odoo.log
workers = 2
max_cron_threads = 1
EOF

mkdir -p /var/log/odoo
chown odoo:odoo /var/log/odoo

echo "[6/8] Installing Odoo modules..."
sudo -u odoo python3 "$INSTALL_DIR/odoo/odoo-bin" -c /etc/odoo.conf -d $DB_NAME \
  -i base,account,stock,product,l10n_ir,fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount \
  --stop-after-init

echo "[7/8] Setting up frontend..."
cd "$INSTALL_DIR/frontend"
sudo -u odoo npm install
sudo -u odoo npm run build

echo "[8/8] Creating systemd services..."

# Odoo service
cat > /etc/systemd/system/odoo.service << EOF
[Unit]
Description=Odoo FMCG
After=postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=odoo
ExecStart=/usr/bin/python3 $INSTALL_DIR/odoo/odoo-bin -c /etc/odoo.conf
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Frontend service
cat > /etc/systemd/system/fmcg-frontend.service << EOF
[Unit]
Description=FMCG Frontend (Next.js)
After=odoo.service

[Service]
Type=simple
User=odoo
WorkingDirectory=$INSTALL_DIR/frontend
ExecStart=/usr/bin/npm start
Environment=PORT=$FRONTEND_PORT
Environment=NODE_ENV=production
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
systemctl daemon-reload
systemctl enable odoo fmcg-frontend
systemctl start odoo fmcg-frontend

echo ""
echo "============================================"
echo "  Installation Complete!"
echo "============================================"
echo ""
echo "  Frontend: http://YOUR_IP:$FRONTEND_PORT"
echo "  Odoo:     http://YOUR_IP:$ODOO_PORT"
echo ""
echo "  Default admin login:"
echo "    Username: admin"
echo "    Password: admin"
echo ""
echo "  To setup Nginx reverse proxy:"
echo "    Edit /etc/nginx/sites-available/fmcg"
echo ""
echo "============================================"
