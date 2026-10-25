#!/usr/bin/env bash
# Restore a backup made by backup.sh:  ./restore.sh backups/20260101-120000
# Replaces the current database and uploaded files. The stack must be running.
set -euo pipefail
cd "$(dirname "$0")"
dir="${1:?usage: ./restore.sh backups/<timestamp>}"
[ -f "$dir/database.sql.gz" ] || { echo "No database.sql.gz in $dir" >&2; exit 1; }

read -r -p "This replaces the current database. Type 'yes' to continue: " answer
[ "$answer" = "yes" ] || exit 1

gunzip -c "$dir/database.sql.gz" | docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
[ -f "$dir/storage-app.tar.gz" ] && docker compose exec -T web tar -C /var/www/html/storage -xzf - < "$dir/storage-app.tar.gz"
docker compose restart web worker scheduler
echo "Restored from $dir. APP_KEY in .env must match the one used when the backup was made."
