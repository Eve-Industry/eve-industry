#!/usr/bin/env bash
# Back up the database, uploaded files and .env into ./backups/<timestamp>/.
# The queue and cache Redis instances hold nothing worth keeping.
set -euo pipefail
cd "$(dirname "$0")"
stamp="$(date +%Y%m%d-%H%M%S)"
dir="backups/$stamp"
mkdir -p "$dir"
umask 077

docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction --routines -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > "$dir/database.sql.gz"
docker compose exec -T web tar -C /var/www/html/storage -czf - app > "$dir/storage-app.tar.gz"
cp .env "$dir/env"
echo "Backup written to $dir (contains secrets: keep it private)"
