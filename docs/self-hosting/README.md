# Self-hosting guide

This is provided as is, without warranty (AGPL-3.0). You run it, you are responsible for it.

## What you get

`docker compose up -d` in the install folder starts:

| Service | Role |
|---|---|
| `caddy` | Public entrypoint on 80/443, automatic HTTPS |
| `web` | nginx + PHP-FPM (only reachable through Caddy) |
| `worker` | Horizon queue workers (market sweeps, imports, per-user refreshes) |
| `scheduler` | Runs the scheduled tasks. Exactly one. |
| `migrate` | One-off: database migrations on every start, then exits |
| `install` | One-off: creates the admin and starts the game-data import, then exits |
| `mysql`, `redis`, `redis-cache` | Database, queues/locks, cache/sessions |

Everything runs as an unprivileged user and only Caddy publishes ports.

## Requirements

* Docker with Compose v2, ports 80 and 443 reachable from the internet (for Let's Encrypt)
* A domain with an A/AAAA record pointing at the host (or use `localhost` to try it)
* An EVE application: [eve-sso.md](eve-sso.md)
* 2 CPU cores, 4 GB RAM and about 10 GB disk to start; the market tables grow over time

## Install

Use the one-line installer from the [README](../../README.md), or manually:

```bash
mkdir eve-industrialist && cd eve-industrialist
# copy docker-compose.yml, docker-compose.no-proxy.yml, Caddyfile and .env.example from deploy/
cp .env.example .env      # fill in every REQUIRED value
mkdir themes
docker compose up -d
docker compose logs install     # the generated admin password is printed once
```

Sign in as admin at `/admin/login`, change the password, then let users sign in with EVE SSO.

## First start: game data

The `install` service imports the static game data (SDE) and global prices and queues the first
Jita market sweep. Other hubs and history fill in through the scheduler over the next hours.
Check progress:

```bash
curl -s https://your.domain/api/v1/health
# {"data":{"status":"ok", ... "setup":{"ready":false,"steps":{"sde":true,"prices":true,"orders":false}}}}
```

Until `setup.ready` is true, some pages show missing items or prices. Both `worker` and `scheduler`
must be running; if you stop them the data stops updating.

## HTTPS and proxies

* **Bundled Caddy (default):** set `APP_URL=https://your.domain` and `SITE_ADDRESS=your.domain`.
* **Your own proxy** (nginx, Traefik, Cloudflare Tunnel): set
  `COMPOSE_FILE=docker-compose.yml:docker-compose.no-proxy.yml` in `.env`. Caddy is disabled and `web`
  listens on `127.0.0.1:8080`. Forward `X-Forwarded-For` and `X-Forwarded-Proto`. If your proxy is not on a
  private network address, set `TRUSTED_PROXIES` to it.
* **Choosing the port:** the installer asks for it, or take it from `PORT` (default 80, or 8080 with your own
  proxy). It is selectable for `DOMAIN=localhost` and `PROXY=none`: for example
  `PORT=8080 DOMAIN=localhost` gives `http://localhost:8080`, and the EVE callback URL then needs the same
  port. A public domain with the bundled Caddy must use 80 and 443 (Let's Encrypt needs them), so the
  installer refuses another port there. Manually, `HTTP_PORT` is the Caddy port (match it in `SITE_ADDRESS`,
  `APP_URL` and `EVE_REDIRECT_URI`) and `WEB_PORT` is the no-proxy port.
* Keep `mysql` and both `redis` services off the internet (they publish no ports by default). Do not expose `/horizon`.

## Updating

```bash
./update.sh                    # Linux / macOS / WSL
./update.sh --backup           # run ./backup.sh first
./update.sh --version 1.2.3    # switch EVE_VERSION in .env, then update
```

```powershell
.\update.ps1                   # Windows; -Version 1.2.3 to switch versions
powershell -ExecutionPolicy Bypass -File .\update.ps1   # if scripts are blocked
```

The updater refreshes every file the installer put next to `.env` (both compose files, `Caddyfile`,
`.env.example` and the helper scripts), pulls every image (app, Caddy, MySQL, Redis), restarts the
stack and waits until `web` is healthy. Migrations run automatically. Details:

* `.env` is never replaced. Settings that are new in `.env.example` are listed so you can add them.
* The compose files, `Caddyfile` and `.env.example` come from the release tag when `EVE_VERSION` is an
  exact version (`1.2.3`), otherwise from `main`. The helper scripts always come from `main`.
  `EVE_RAW_URL` points both somewhere else (a fork, a mirror).
* The previous files are kept in `.previous/`. If the new compose file does not accept your `.env`
  (for example a new REQUIRED setting), the old files are put back and nothing restarts.
* An install from before the project name was fixed keeps its old name (`COMPOSE_PROJECT_NAME` is added
  to `.env`), so the update does not start a second, empty stack.
* `--skip-files` / `-SkipFiles` only pulls images and restarts, for hand-edited compose files.

Pin a release with `EVE_VERSION=1.2.3` in `.env` instead of `latest` (image tags have no `v`). Read the
changelog before major upgrades and take a backup first.

## Backups

```bash
./backup.sh                          # database + uploaded files + .env into backups/<timestamp>/
./restore.sh backups/20260101-120000
```

Back up `APP_KEY` separately and keep it safe: encrypted ESI tokens cannot be read without it.
Copy `backups/` off the machine.

## Logs

Application logs are one file per day, the last 5 days kept (`LOG_DAILY_DAYS`), in the `storage-data`
volume (`/var/www/html/storage/logs`). Container output: `docker compose logs -f web worker scheduler`.

## Optional features

* **Push notifications:** `docker compose exec worker php artisan notifications:vapid-keys`, put the keys and
  `WEBPUSH_VAPID_SUBJECT=mailto:you@example.com` in `.env`, then `docker compose up -d`.
* **Discord welcome bot:** work in progress and switched off in this release.
* **Look and feel:** [styling.md](../styling.md).
* **Community link:** `DISCORD_INVITE_URL`.
* **ESI diagnostics:** [docs/operations/esi-diagnostics.md](../operations/esi-diagnostics.md).

## Troubleshooting

| Symptom | Check |
|---|---|
| `docker compose up` stops with "X is required" | A REQUIRED value in `.env` is empty |
| Browser shows a certificate error | DNS does not point at the host yet, or 80/443 are blocked; `docker compose logs caddy` |
| "Invalid callback" after EVE login | The callback URL in your EVE application must equal `EVE_REDIRECT_URI` exactly |
| Pages empty, no prices | `/api/v1/health` `setup`; `docker compose ps` (worker and scheduler running?); `docker compose logs install worker` |
| Everything slow, ESI errors | The ESI error limit is per application; see the ESI docs under `docs/operations/` |
| Lost admin password | `docker compose exec web php artisan admin:reset` (uses `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from `.env`; set a strong password first) |
| Moved servers | Restore a backup and keep the same `APP_KEY` |
| Migrate fails with "Access denied", or other containers get replaced | Another Compose project shares this stack's project name or volumes (older compose files took the name from the install folder). The compose file now fixes the name to `eve-industry`. Never run `docker compose down -v` while unsure which volumes are attached. To run two copies on one machine, give each its own `COMPOSE_PROJECT_NAME` in `.env`. |
