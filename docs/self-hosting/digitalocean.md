# DigitalOcean: a Droplet with Managed MySQL

This puts the app, its workers and Redis on one Droplet and the database on a DigitalOcean Managed
MySQL cluster. You get the provider's daily backups, point-in-time restore and updates for the
database; everything else is the normal Docker Compose stack from [README.md](README.md).

Provided as is, without warranty (AGPL-3.0).

## What you need

* A domain you can add a DNS record to
* An EVE application: [eve-sso.md](eve-sso.md) (callback `https://your.domain/auth/eve/callback`)
* A DigitalOcean account and, optionally, [`doctl`](https://docs.digitalocean.com/reference/doctl/)

Sizing to start:

| Resource | Size |
|---|---|
| Droplet | Ubuntu 24.04, 2 vCPU / 4 GB RAM (web, Horizon with up to 5 workers, both Redis) |
| Managed MySQL | MySQL 8, 1 node, 2 GB RAM, 25 GB+ storage. The market tables grow; storage can be raised later without downtime. |

Put both in the **same region and VPC**, so the app talks to the database over the private network.

## 1. Create the database cluster

In the control panel: **Databases → Create Database Cluster → MySQL 8**, pick the region and VPC
you will use for the Droplet.

When it is up:

1. **Users & Databases:** add a database `eve_industrialist` and a user `eve_industrialist`. Keep
   the generated password.
2. **Settings → Trusted sources:** add the Droplet once it exists (step 2). Until then nobody can
   connect, which is what you want.
3. **Connection details:** switch to **VPC network** and note the host (`private-….db.ondigitalocean.com`)
   and port (`25060`). Download the **CA certificate** (`ca-certificate.crt`).
4. Turn off `sql_require_primary_key`. DigitalOcean enables it by default, and some migrations
   create or change tables in steps that it rejects:

   ```bash
   doctl databases list
   ```

   ```bash
   doctl databases configuration update <cluster-id> --engine mysql --config-json '{"sql_require_primary_key": false}'
   ```

   (Or ask DigitalOcean support to change it if you do not use `doctl`.)

## 2. Create the Droplet

**Droplets → Create**: Ubuntu 24.04, the same region and VPC, 2 vCPU / 4 GB, your SSH key.

Then:

* **Networking → Firewalls:** allow inbound TCP 22 (from your IP only), TCP 80, TCP 443 and UDP 443.
  Nothing else; MySQL is not on this machine and Redis publishes no ports.
* **DNS:** an A record (and AAAA if you enabled IPv6) for your domain pointing at the Droplet.
* Back on the database: add the Droplet under **Trusted sources**.

SSH in and install Docker (Compose 2.24 or newer is needed for the override file):

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
docker compose version
```

Add swap so a memory spike during the first import does not kill a worker:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Get the stack files

```bash
mkdir -p /opt/eve-industrialist/themes && cd /opt/eve-industrialist
```

```bash
for f in docker-compose.yml docker-compose.managed-db.yml docker-compose.no-proxy.yml Caddyfile .env.example update.sh backup.sh restore.sh; do curl -fsSLO "https://raw.githubusercontent.com/Eve-Industry/eve-industry/main/deploy/$f"; done; chmod +x *.sh
```

Copy the CA certificate you downloaded next to the compose files, named `db-ca.crt`, and make it
readable by the container user:

```bash
scp ca-certificate.crt root@your.domain:/opt/eve-industrialist/db-ca.crt
```

```bash
chmod 644 /opt/eve-industrialist/db-ca.crt
```

## 4. Configure `.env`

```bash
cp .env.example .env && chmod 600 .env
```

Fill in the REQUIRED values as in [README.md](README.md) (`APP_URL`, `APP_KEY`, `SITE_ADDRESS`, the
EVE values, `ESI_USER_AGENT`), then the database section:

```dotenv
COMPOSE_FILE=docker-compose.yml:docker-compose.managed-db.yml

DB_HOST=private-db-mysql-ams3-12345-do-user-678-0.d.db.ondigitalocean.com
DB_PORT=25060
DB_DATABASE=eve_industrialist
DB_USERNAME=eve_industrialist
DB_PASSWORD=<the password from step 1>
# Not used with a managed database, but the compose file still asks for it.
DB_ROOT_PASSWORD=<any random string>
```

Generate `APP_KEY` with `echo "base64:$(openssl rand -base64 32)"` and keep a copy somewhere safe:
encrypted ESI tokens in the database cannot be read without it, even from a DigitalOcean backup.

What the override does: it turns off the bundled `mysql` service, points every app container at
`DB_HOST`/`DB_PORT`, mounts `db-ca.crt` and sets `MYSQL_ATTR_SSL_CA` so connections use TLS
(DigitalOcean refuses unencrypted ones).

## 5. Start it

```bash
docker compose up -d
```

```bash
docker compose logs install
```

The install log prints the generated admin password once. Sign in at `https://your.domain/admin/login`
and change it. The game data import then runs in the background; follow it with
`curl -s https://your.domain/api/v1/health` until `setup.ready` is true (see
[README.md](README.md#first-start-game-data)).

Check after the first start:

```bash
docker compose ps
```

`migrate` and `install` should have exited with code 0; `caddy`, `web`, `worker`, `scheduler`,
`redis` and `redis-cache` should be running. There is no `mysql` container.

## Updating

```bash
./update.sh
```

`update.sh` keeps `.env` (and so `COMPOSE_FILE`), `db-ca.crt` and `docker-compose.managed-db.yml`; it
does not re-download the override, so fetch it again by hand if a release note says it changed.
Migrations run against the managed database on every update. For a major upgrade, take an on-demand
backup first (below).

## Backups

The bundled `backup.sh` dumps the local `mysql` container and does not work with a managed database.
Instead:

* **Database:** DigitalOcean takes daily backups with point-in-time restore (7 days). Restore into a
  new cluster from **Databases → your cluster → Backups**, then change `DB_HOST` and run
  `docker compose up -d`. For a copy you hold yourself:

  ```bash
  docker run --rm --env-file .env -v "$PWD/db-ca.crt:/ca.crt:ro" mysql:8.0 sh -c 'exec mysqldump --ssl-ca=/ca.crt --ssl-mode=VERIFY_CA --single-transaction --set-gtid-purged=OFF -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE"' | gzip > eve-$(date +%F).sql.gz
  ```

* **Uploaded files** (sponsor images):

  ```bash
  docker compose exec -T web tar -C /var/www/html/storage -czf - app > storage-app-$(date +%F).tar.gz
  ```

* **`.env`**, above all `APP_KEY`.

Redis holds only queues and cache, so Droplet backups or snapshots are optional.

## Troubleshooting

| Symptom | Check |
|---|---|
| `migrate` hangs or fails with a timeout | The Droplet is not in the database's **Trusted sources**, or `DB_HOST` is the public host while the Droplet is in another VPC/region |
| "Connections using insecure transport are prohibited" | `db-ca.crt` is missing or not readable (`chmod 644`), or `COMPOSE_FILE` does not include `docker-compose.managed-db.yml` |
| SSL certificate verify failed | `db-ca.crt` is not the CA certificate of this cluster; download it again |
| "Unable to create or change a table without a primary key" | `sql_require_primary_key` is still on (step 1.4); fix it and `docker compose up -d` again, migrations resume |
| "Access denied for user" | `DB_USERNAME` / `DB_PASSWORD` do not match the user from step 1, or the user has no rights on `DB_DATABASE` |
| `service "web" depends on undefined service "mysql"` | Docker Compose is older than 2.24 and ignores `!override`; update Docker |

Anything else: the general [troubleshooting table](README.md#troubleshooting).
