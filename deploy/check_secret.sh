#!/bin/bash
sudo -u postgres psql -d smoke -t -c "SELECT length(value), left(value, 10) FROM ir_config_parameter WHERE key='database.secret';"
echo "---"
sudo -u postgres psql -d smoke -t -c "SELECT key FROM ir_config_parameter WHERE key LIKE 'database%';"
