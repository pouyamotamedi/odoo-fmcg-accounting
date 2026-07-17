#!/bin/bash
# Setup daily backup cron job (runs at 3:00 AM daily)

SCRIPT_PATH="/opt/fmcg-accounting/deploy/backup.sh"

chmod +x "$SCRIPT_PATH"

# Add cron job if not already exists
(crontab -l 2>/dev/null | grep -v "backup.sh"; echo "0 3 * * * $SCRIPT_PATH >> /var/log/fmcg-backup.log 2>&1") | crontab -

echo "Cron job added: daily backup at 3:00 AM"
echo "Logs: /var/log/fmcg-backup.log"
echo "Backups: /opt/fmcg-backups/"
