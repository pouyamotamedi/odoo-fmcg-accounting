#!/bin/bash
sudo -u postgres psql -d smoke -c "UPDATE res_users SET password = 'admin' WHERE id = 2;"
systemctl restart odoo-smoke
sleep 3
python3 /tmp/test_odoo.py
python3 /tmp/test_via_nextjs.py
