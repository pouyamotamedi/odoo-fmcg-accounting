#!/bin/bash
set -e

echo "=== FMCG Server Setup for smoke.mediumco.org ==="

# PostgreSQL setup
echo "[1/7] Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE ROLE odoo WITH LOGIN PASSWORD 'odoo' CREATEDB;" 2>/dev/null || echo "  Role already exists"
sudo -u postgres psql -c "CREATE DATABASE smoke OWNER odoo;" 2>/dev/null || echo "  DB already exists"

# Clone repo
echo "[2/7] Cloning repository..."
rm -rf /opt/fmcg
git clone -b feature/frontend-api-integration https://github.com/pouyamotamedi/odoo-fmcg-accounting.git /opt/fmcg || {
    echo "  Repo is private. Trying with token..."
    echo "  ERROR: Need GitHub access. Make repo public or provide token."
    exit 1
}

# Odoo Python dependencies
echo "[3/7] Installing Python dependencies..."
cd /opt/fmcg
pip3 install psycopg2-binary lxml Pillow reportlab passlib python-dateutil pytz babel decorator docutils gevent greenlet Jinja2 MarkupSafe num2words ofxparse polib psutil pydot PyPDF2 pyserial python-stdnum qrcode vobject Werkzeug xlrd xlsxwriter xlwt chardet cryptography idna requests urllib3 2>/dev/null

# Odoo config
echo "[4/7] Creating Odoo config..."
cat > /etc/odoo-smoke.conf << 'CONF'
[options]
db_host = localhost
db_port = 5432
db_user = odoo
db_password = odoo
db_name = smoke
addons_path = /opt/fmcg/odoo/odoo/addons,/opt/fmcg/odoo/addons,/opt/fmcg/custom_addons
http_port = 8069
admin_passwd = admin
log_level = warn
logfile = /var/log/odoo/odoo-smoke.log
workers = 2
max_cron_threads = 1
CONF
mkdir -p /var/log/odoo
chown -R odoo:odoo /opt/fmcg /var/log/odoo

# Install Odoo modules
echo "[5/7] Installing Odoo modules (3-5 minutes)..."
sudo -u odoo python3 /opt/fmcg/odoo/odoo-bin -c /etc/odoo-smoke.conf -d smoke \
  -i base,account,stock,stock_account,product,fmcg_base,fmcg_accounting,fmcg_bank_cash,fmcg_credit,fmcg_discount,fmcg_inventory,fmcg_persian,fmcg_offline,fmcg_pos_terminal,fmcg_reports \
  --stop-after-init --without-demo=all --load-language=fa_IR

# Set admin lang
sudo -u postgres psql -d smoke -c "UPDATE res_partner SET lang='fa_IR' WHERE id IN (SELECT partner_id FROM res_users WHERE id=2);"

# Frontend build
echo "[6/7] Building frontend..."
cd /opt/fmcg/frontend
cat > .env.local << 'ENV'
NEXT_PUBLIC_ODOO_URL=http://localhost:8069
NEXT_PUBLIC_ODOO_DB=smoke
ENV
npm install
npm run build

# Systemd services
echo "[7/7] Creating services..."
cat > /etc/systemd/system/odoo-smoke.service << 'SVC'
[Unit]
Description=Odoo FMCG (smoke)
After=postgresql.service

[Service]
Type=simple
User=odoo
ExecStart=/usr/bin/python3 /opt/fmcg/odoo/odoo-bin -c /etc/odoo-smoke.conf
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVC

cat > /etc/systemd/system/fmcg-smoke.service << 'SVC'
[Unit]
Description=FMCG Frontend (smoke)
After=odoo-smoke.service

[Service]
Type=simple
User=odoo
WorkingDirectory=/opt/fmcg/frontend
ExecStart=/usr/bin/npm start
Environment=PORT=3000
Environment=NODE_ENV=production
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVC

# Nginx config
cat > /etc/nginx/sites-available/smoke.mediumco.org << 'NGINX'
server {
    listen 80;
    server_name smoke.mediumco.org;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8069/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/smoke.mediumco.org /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Start everything
systemctl daemon-reload
systemctl enable odoo-smoke fmcg-smoke nginx
systemctl restart odoo-smoke fmcg-smoke nginx

echo ""
echo "=== DONE! ==="
echo "  URL: http://smoke.mediumco.org"
echo "  Admin: admin / admin"
echo ""
