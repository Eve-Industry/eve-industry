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
# The container runs as the unprivileged www-data user.
APP_ROLE="${APP_ROLE:-web}"

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

case "$APP_ROLE" in
    web)
        ;;
    worker)
        exec php artisan horizon
        ;;
    scheduler)
        exec php artisan schedule:work
        ;;
    *)
        echo "Unknown APP_ROLE '$APP_ROLE' (expected web, worker, scheduler, migrate or install)" >&2
        exit 1
        ;;
esac

mkdir -p /tmp/nginx

# Start PHP-FPM in background. The php:8.3-fpm image listens on TCP 9000
# (zz-docker.conf), which docker/nginx/default.app.conf passes to.
php-fpm -D

# Start nginx in foreground
exec nginx -c /etc/nginx/nginx.conf -g 'daemon off;'
