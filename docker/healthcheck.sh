#!/bin/sh
# Container health, by role. Used by the image HEALTHCHECK.
case "${APP_ROLE:-web}" in
    web)
        curl -fsS -o /dev/null http://127.0.0.1:8080/up
        ;;
    worker)
        php /var/www/html/artisan horizon:status 2>/dev/null | grep -qi "is running"
        ;;
    scheduler)
        pgrep -f "schedule:work" >/dev/null
        ;;
    *)
        exit 0
        ;;
esac
