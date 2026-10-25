# Deploying to DigitalOcean App Platform

This project includes a Docker-based configuration suitable for DigitalOcean App Platform.

Quick steps

1. Push your repository to GitHub or GitLab.
2. In DigitalOcean, create a new App and connect your repository.
3. Use the existing `app.yaml` to preconfigure the app or configure via the UI.
4. Set required runtime environment variables in the App's Settings (APP_KEY, DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD, REDIS_HOST, etc.).

What this repository includes for DO App Platform

- `Dockerfile.app` - production-ready Dockerfile that builds PHP-FPM + Nginx and uses `/start.sh` to run both.
- `docker/nginx/default.app.conf` - nginx config that points to `/var/www/html/public` and listens on port 8080.
- `docker/start.sh` - start script executed in the container.
- `app.yaml` - DigitalOcean App spec you can import when creating the app (edit repo/branch and secrets).

Running web, workers and scheduler

The same image runs in three roles, chosen by the `APP_ROLE` environment variable read by `docker/start.sh`:

| `APP_ROLE` | Runs | App Platform component |
|------------|------|------------------------|
| `web` (default) | nginx + PHP-FPM | Web service |
| `worker` | `php artisan horizon` | Worker |
| `scheduler` | `php artisan schedule:work` | Worker (exactly one instance) |
| `migrate` | `php artisan migrate --force`, then exits | Pre-deploy job |

No long-running role runs migrations. Run the image once per deploy with `APP_ROLE=migrate`, as an App Platform pre-deploy job, before the new web, worker and scheduler start. `docker-compose.yml` wires the same roles locally (its `migrate` service runs first).

After a deploy, run `docker/smoke-test.sh https://your-app.example` to check `/up`, `/api/v1/health` (database and cache) and that the API answers 401 to an anonymous `/api/v1/me`.

Redis: queues and Horizon need a Redis that never evicts (`maxmemory-policy noeviction`, `REDIS_HOST`). Put the cache and sessions on a separate, evicting Redis (`allkeys-lru`) with `REDIS_CACHE_HOST` and `SESSION_CONNECTION=cache`; without `REDIS_CACHE_HOST` both use `REDIS_HOST`.

Notes and recommendations

- Ensure `APP_KEY` is provided in runtime environment variables in the DigitalOcean App settings.
- Set `CACHE_DRIVER=redis` and configure `REDIS_HOST` to the DigitalOcean Managed Redis cluster host.
- Use Managed Databases on DigitalOcean and set `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` in the App settings.
- For storage (user uploads), configure an S3-compatible bucket (Spaces) and set `FILESYSTEM_DISK=s3` and appropriate credentials.
- Consider using App Platform's managed certificates and CDN options for static assets.

Deployment commands (local testing)

You can test the Dockerfile locally before deploying:

```bash
# build
docker build -t eve-auth-app -f Dockerfile.app .
# run
docker run -p 8080:8080 --env-file .env -d eve-auth-app
# visit http://localhost:8080
```

If you need help wiring secrets or automating the DigitalOcean deployment, I can add GitHub Actions for CI/CD that deploy to DigitalOcean when you push to `main`.
