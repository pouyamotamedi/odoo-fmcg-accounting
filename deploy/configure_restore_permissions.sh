#!/bin/bash
# Grants the frontend user access only to stop/start this instance's Odoo service.
# Usage: sudo bash configure_restore_permissions.sh <database_name>

set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
    echo "ERROR: run this script as root (sudo)." >&2
    exit 1
fi

DB_NAME="${1:-}"
if [[ ! "${DB_NAME}" =~ ^[a-z][a-z0-9_-]{0,62}$ ]]; then
    echo "ERROR: invalid database name: ${DB_NAME}" >&2
    exit 1
fi

SYSTEMCTL_PATH="$(command -v systemctl)"
if [ -z "${SYSTEMCTL_PATH}" ]; then
    echo "ERROR: systemctl was not found." >&2
    exit 1
fi

SERVICE_NAME="odoo-${DB_NAME}.service"
SUDOERS_FILE="/etc/sudoers.d/fmcg-${DB_NAME}-restore"
TEMP_FILE="$(mktemp)"
trap 'rm -f "${TEMP_FILE}"' EXIT

cat > "${TEMP_FILE}" << EOF
# Managed by FMCG Accounting. Limit the frontend to its own Odoo service.
odoo ALL=(root) NOPASSWD: ${SYSTEMCTL_PATH} stop ${SERVICE_NAME}, ${SYSTEMCTL_PATH} start ${SERVICE_NAME}
EOF

chmod 0440 "${TEMP_FILE}"
visudo -cf "${TEMP_FILE}" >/dev/null
install -o root -g root -m 0440 "${TEMP_FILE}" "${SUDOERS_FILE}"

echo "Restore service permissions configured for ${SERVICE_NAME}."
