#!/usr/bin/env bash
set -e

# One image, three long-running roles and two one-off steps. APP_ROLE picks
# what this container runs:
#   web        nginx + PHP-FPM (default)
#   worker     Horizon queue workers (default, market and updates queues)
#   scheduler  the Laravel scheduler (runs schedule:run every minute)
#   migrate    `php artisan migrate --force`, then exits. Run it once per
#              deploy, before the new web/worker/scheduler start (a
#              pre-deploy job); no long-running role ever migrates.
#   install    `php artisan app:install`: first-run setup (admin account and
#              game data import), then exits. Safe to run again.
#   await-migrations
#              waits until the database has no pending migrations, then
#              exits. A Kubernetes init container, so pods start only after
#              the migrate Job has finished.
# The container runs as the unprivileged www-data user.
APP_ROLE="${APP_ROLE:-web}"

# storage/ may be an empty volume (a fresh named volume, a Kubernetes emptyDir):
# recreate the directories Laravel writes to.
mkdir -p storage/app/public storage/framework/cache/data storage/framework/sessions \
    storage/framework/views storage/logs bootstrap/cache

# Platforms that hand over the database CA certificate as a value rather than a
# file (DigitalOcean App Platform's ${db.CA_CERT}): write it out for PDO.
if [ -n "${DB_CA_CERT:-}" ] && [ -z "${MYSQL_ATTR_SSL_CA:-}" ]; then
    printf '%s\n' "$DB_CA_CERT" > /tmp/db-ca.crt
    export MYSQL_ATTR_SSL_CA=/tmp/db-ca.crt
fi

if [ "$APP_ROLE" = "await-migrations" ]; then
    # --pending=1 exits 1 while migrations are pending; any other failure
    # (database not up yet, no migrations table) also means keep waiting.
    until php artisan migrate:status --pending=1 >/dev/null 2>&1; do
        echo "Waiting for migrations..."
        sleep 5
    done
    exit 0
fi

if [ "$APP_ROLE" = "migrate" ]; then
    exec php artisan migrate --force
fi

if [ "$APP_ROLE" = "install" ]; then
    exec php artisan app:install ${INSTALL_ARGS:-}
fi

# Warm Laravel framework caches so config, routes, views and events are not
# re-parsed on every request. Runs at startup where environment variables are
# available (config:cache bakes in env values, so it must run at runtime).
php artisan config:cache || true
php artisan route:cache || true
php artisan view:cache || true
php artisan event:cache || true

# Make sure the public disk link exists (storage is a mounted volume).
[ -e public/storage ] || php artisan storage:link || true

# Runs a command off PID 1 and turns any stop signal into SIGTERM for it. The
# image's stop signal is SIGQUIT (nginx's graceful stop), and Kubernetes sends
# it too (containerd honours STOPSIGNAL), but Horizon ignores SIGQUIT and
# schedule:work as PID 1 would ignore every signal it has no handler for.
run_until_stopped() {
    "$@" &
    child=$!
    trap 'kill -TERM "$child" 2>/dev/null || true' TERM INT QUIT
    status=0
    # wait returns early when a trapped signal arrives: wait again until it exits.
    while kill -0 "$child" 2>/dev/null; do wait "$child" || status=$?; done
    exit "$status"
}

case "$APP_ROLE" in
    web)
        ;;
    worker)
        # Horizon stops taking jobs on SIGTERM and waits for running ones.
        run_until_stopped php artisan horizon
        ;;
    scheduler)
        run_until_stopped php artisan schedule:work
        ;;
    *)
        echo "Unknown APP_ROLE '$APP_ROLE' (expected web, worker, scheduler, migrate, install or await-migrations)" >&2
        exit 1
        ;;
esac

mkdir -p /tmp/nginx

# Start PHP-FPM in background. The php:8.3-fpm image listens on TCP 9000
# (zz-docker.conf), which docker/nginx/default.app.conf passes to.
php-fpm -D

# Start nginx in foreground
exec nginx -c /etc/nginx/nginx.conf -g 'daemon off;'
