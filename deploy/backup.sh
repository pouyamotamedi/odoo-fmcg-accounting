#!/bin/bash
# ============================================================
# FMCG Accounting - Backup Script
# Usage: bash backup.sh [database_name]
# Auto-run via cron: 0 3 * * * /opt/fmcg-smoke/deploy/backup.sh smoke
# ============================================================

DB_NAME="${1:-smoke}"
BACKUP_DIR="/opt/fmcg-backups/${DB_NAME}"
KEEP_DAYS=30
DATE=$(date +%Y-%m-%d_%H-%M)

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Backup starting for: ${DB_NAME}"

# Database dump
pg_dump -U odoo -h localhost "${DB_NAME}" | gzip > "${BACKUP_DIR}/db_${DATE}.sql.gz"

# Filestore
FILESTORE="/home/odoo/.local/share/Odoo/filestore/${DB_NAME}"
if [ -d "${FILESTORE}" ]; then
    tar -czf "${BACKUP_DIR}/filestore_${DATE}.tar.gz" -C "${FILESTORE}" . 2>/dev/null
fi

# Cleanup old
find "${BACKUP_DIR}" -name "*.gz" -mtime +${KEEP_DAYS} -delete

SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
echo "[$(date)] Backup done: ${BACKUP_DIR}/db_${DATE}.sql.gz (total: ${SIZE})"
