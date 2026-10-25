#!/usr/bin/env bash
# Pull the newest image for EVE_VERSION and restart. Migrations run
# automatically in the one-off migrate service. Back up first: ./backup.sh
set -euo pipefail
cd "$(dirname "$0")"
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
echo "Updated. Check: docker compose ps"
