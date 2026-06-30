# Fresh Setup Script for FMCG Shop
# This creates a clean database with Iranian locale and Toman currency
# Run this ONCE when setting up for production use

Write-Host "=== FMCG Shop - Fresh Setup ===" -ForegroundColor Green

# Config
$PGBIN = "C:\Program Files\PostgreSQL\16\bin"
$env:PGPASSWORD = "postgres"
$DB_NAME = "fmcg_shop"
$ODOO_BIN = ".\venv\Scripts\python.exe"
$ODOO_CMD = ".\odoo\odoo-bin"
$CONF = ".\odoo.conf"

# Step 1: Drop and recreate database
Write-Host "`n[1/4] Creating fresh database..." -ForegroundColor Yellow
& "$PGBIN\psql.exe" -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
& "$PGBIN\psql.exe" -U postgres -c "CREATE DATABASE $DB_NAME OWNER odoo;"

# Step 2: Install all modules WITHOUT demo data + Persian language
Write-Host "`n[2/4] Installing modules (this takes 5-10 minutes)..." -ForegroundColor Yellow
$modules = "base,fmcg_base,fmcg_bank_cash,fmcg_inventory,fmcg_accounting,fmcg_credit,fmcg_pos_terminal,fmcg_persian,fmcg_reports,fmcg_offline"
& $ODOO_BIN $ODOO_CMD -c $CONF --stop-after-init --without-demo=all -i $modules --load-language=fa_IR

# Step 3: Set admin user language to Persian
Write-Host "`n[3/4] Setting admin language to Persian..." -ForegroundColor Yellow
& "$PGBIN\psql.exe" -U odoo -d $DB_NAME -c "UPDATE res_users SET lang='fa_IR' WHERE id=2;"

# Step 4: Done
Write-Host "`n[4/4] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Start the server with:" -ForegroundColor Cyan
Write-Host "  .\venv\Scripts\python.exe .\odoo\odoo-bin -c .\odoo.conf"
Write-Host ""
Write-Host "Then open: http://localhost:8069" -ForegroundColor Cyan
Write-Host "Login: admin / admin" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: After first login, go to:" -ForegroundColor Yellow
Write-Host "  Settings > Companies > Your Company > Currency = IRT (Toman)" -ForegroundColor Yellow
