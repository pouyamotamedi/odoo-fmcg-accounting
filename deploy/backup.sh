#!/bin/bash
# ============================================
# FMCG Accounting - Daily Backup Script
# Run via cron: 0 3 * * * /opt/fmcg-accounting/deploy/backup.sh
# ============================================

BACKUP_DIR="/opt/fmcg-backups"
DB_NAME="fmcg_shop"
DB_USER="odoo"
KEEP_DAYS=30  # Keep backups for 30 days
DATE=$(date +%Y-%m-%d_%H-%M)

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# 1. Database backup (SQL dump)
echo "  Dumping database..."
pg_dump -U $DB_USER -h localhost $DB_NAME | gzip > "$BACKUP_DIR/db_${DB_NAME}_${DATE}.sql.gz"

# 2. Odoo filestore backup (attachments, images)
echo "  Backing up filestore..."
FILESTORE_DIR="/home/odoo/.local/share/Odoo/filestore/$DB_NAME"
if [ -d "$FILESTORE_DIR" ]; then
  tar -czf "$BACKUP_DIR/filestore_${DB_NAME}_${DATE}.tar.gz" -C "$FILESTORE_DIR" . 2>/dev/null
fi

# 3. Delete old backups
echo "  Cleaning old backups (older than $KEEP_DAYS days)..."
find "$BACKUP_DIR" -name "*.gz" -mtime +$KEEP_DAYS -delete

# 4. Show backup size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "  Backup directory size: $TOTAL_SIZE"

echo "[$(date)] Backup complete: db_${DB_NAME}_${DATE}.sql.gz"
