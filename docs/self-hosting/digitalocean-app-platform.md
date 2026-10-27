# DigitalOcean App Platform

This runs the published image on App Platform: `web` as a service, `worker` and `scheduler` as
workers, migrations as a pre-deploy job and first-run setup as a post-deploy job. MySQL and Redis
are DigitalOcean managed databases and uploads go to a Spaces bucket. There is no server to patch,
but it costs more than a Droplet. For one Droplet with Managed MySQL see
[digitalocean.md](digitalocean.md).

Provided as is, without warranty (AGPL-3.0).

## How it maps

| Stack part | App Platform | Size to start |
|---|---|---|
| `web` | Service, port 8080, health check `/up` | 1 vCPU / 1 GB, 1 instance (can be raised) |
| `worker` (Horizon) | Worker | 1 vCPU / 2 GB, exactly 1 instance |
| `scheduler` | Worker | 1 vCPU / 2 GB, exactly 1 instance |
| `migrate` | Job, `PRE_DEPLOY` | 1 GB |
| `install` | Job, `POST_DEPLOY` | 2 GB |
| `mysql` | Managed MySQL 8 | 2 GB RAM, 25 GB+ storage |
| `redis` (queues, locks, sessions) | Managed Valkey, eviction **noeviction** | 1 GB |
| `redis-cache` | Managed Valkey, eviction **allkeys-lru** | 1 GB |
| `storage-data` volume (sponsor banners) | Spaces bucket (`UPLOADS_DISK=s3`) | |
| `caddy` | Not used: App Platform terminates HTTPS | |

The worker and scheduler must stay at one instance each. Horizon's process counts are sized
against ESI rate limits, and a second scheduler would run every task twice.

The two Redis roles need different eviction policies (see
[esi-scaling.md](../operations/esi-scaling.md)), which is why there are two Valkey clusters. One
cluster with `noeviction` also works if you watch its memory: once it is full, cache writes fail.

## Limitations

* **The container disk is not kept.** It is replaced on every deploy and restart, which is why
  uploads go to Spaces. Leave out the Spaces settings only if you do not use sponsors.
* **Logs** go to the console (`LOG_CHANNEL=stderr`): Runtime Logs in the control panel, or
  `doctl apps logs`. Forward them to a log service if you need more than App Platform keeps.
* The `deploy/` scripts (`update.sh`, `backup.sh`, ...) do not apply here.

## What you need

* A domain you can add a DNS record to
* An EVE application: [eve-sso.md](eve-sso.md), callback `https://your.domain/auth/eve/callback`
* [`doctl`](https://docs.digitalocean.com/reference/doctl/), authenticated (`doctl auth init`)
* A copy of [`deploy/digitalocean-app.yaml`](../../deploy/digitalocean-app.yaml)

## 1. Create the databases

Create the three clusters in the region you will use for the app (`ams3` here; the app spec says
`ams`). The names must match `cluster_name` in the spec.

```bash
doctl databases create eve-mysql --engine mysql --version 8 --region ams3 --size db-s-1vcpu-2gb --num-nodes 1
```

```bash
doctl databases create eve-valkey-queue --engine valkey --region ams3 --size db-s-1vcpu-1gb --num-nodes 1
```

```bash
doctl databases create eve-valkey-cache --engine valkey --region ams3 --size db-s-1vcpu-1gb --num-nodes 1
```

Wait until all three are `online` (`doctl databases list`), then:

1. **MySQL database and user:**

   ```bash
   doctl databases db create <mysql-cluster-id> eve_industrialist
   ```

   ```bash
   doctl databases user create <mysql-cluster-id> eve_industrialist
   ```

2. **Turn off `sql_require_primary_key`** on the MySQL cluster. DigitalOcean enables it, and some
   migrations create or change tables in steps it rejects:

   ```bash
   doctl databases configuration update <mysql-cluster-id> --engine mysql --config-json '{"sql_require_primary_key": false}'
   ```

3. **Eviction policies:** in the control panel, open each Valkey cluster → **Settings → Eviction
   policy**: `eve-valkey-queue` → `noeviction`, `eve-valkey-cache` → `allkeys-lru`. Queues and locks
   must never be evicted; a lost lock lets a job run twice.

Trusted sources are added for you when the app is created with these databases attached.

## 2. Create the Spaces bucket

In the control panel: **Spaces Object Storage → Create Bucket**, in the same region (`ams3`). File
listing can stay restricted: each banner is uploaded with a public-read ACL, so it can be shown
without the bucket being listable. Enabling the CDN is optional; if you do, use its endpoint as
`AWS_URL`.

Then **Spaces Object Storage → Access Keys → Create Access Key**, limited to this bucket with read/write.
Note the key ID and the secret (shown once).

## 3. Fill in the app spec

Copy `deploy/digitalocean-app.yaml` somewhere outside the repository and edit it:

* `region`, and `domains[0].domain`
* Every `CHANGE_ME`: `APP_KEY` (`echo "base64:$(openssl rand -base64 32)"`), `EVE_CLIENT_ID`,
  `EVE_CLIENT_SECRET`, and the Spaces values: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_BUCKET` (the bucket name) and `AWS_URL` (`https://<bucket>.ams3.digitaloceanspaces.com`, or the
  CDN endpoint). Change `ams3` in `AWS_ENDPOINT` and `AWS_URL` if your bucket is elsewhere.
* Every `eve.example.com` (`APP_URL`, `EVE_REDIRECT_URI`, `ESI_USER_AGENT`) and `SUPER_ADMIN_EMAIL`
* The image `tag` in all five places, to the release you want (no `v`, for example `1.0.3`)

Keep `APP_KEY` somewhere safe as well: ESI tokens are encrypted with it, and a database backup is
useless without it.

The database settings are filled in by App Platform from the attached clusters (`${db.HOSTNAME}`,
`${queue.PASSWORD}`, ...). `DB_CA_CERT` receives the MySQL CA certificate; the container writes it to
a file at start-up and connects over TLS. `REDIS_SCHEME=tls` does the same for Valkey.

The image is public on GHCR, so no registry credentials are needed. If you build your own private
image, add `registry_credentials: "user:token"` to each `image` block.

## 4. Create the app

```bash
doctl apps spec validate digitalocean-app.yaml
```

```bash
doctl apps create --spec digitalocean-app.yaml
```

The first deploy pulls the image, runs `migrate`, starts `web`, `worker` and `scheduler`, then
runs `install`. Follow it in the control panel (**Apps → eve-industry → Activity**) or:

```bash
doctl apps list
```

```bash
doctl apps logs <app-id> install --type run
```

The `install` log prints the generated admin password once. If you miss it, set
`SUPER_ADMIN_PASSWORD` (as a secret) in the app's settings and run `php artisan admin:reset` from the
`web` component's **Console** tab.

## 5. Point your domain at it

App Platform shows the DNS record to create under **Settings → Domains** (a CNAME to the app's
`ondigitalocean.app` host, or nameservers if DigitalOcean manages the domain). The certificate is
issued once DNS resolves. Until then the app answers on its `*.ondigitalocean.app` URL, but EVE login
only works on the domain in `EVE_REDIRECT_URI`.

Then sign in at `https://your.domain/admin/login`, change the admin password, and follow the game
data import with `curl -s https://your.domain/api/v1/health` until `setup.ready` is true (see
[README.md](README.md#first-start-game-data)).

## Updating

Change the image `tag` in all five components and apply the spec:

```bash
doctl apps update <app-id> --spec digitalocean-app.yaml
```

`migrate` runs before the new version takes traffic; if it fails, the deploy stops and the old
version keeps running. Read the changelog first and take an on-demand MySQL backup before major
upgrades. To keep the spec App Platform has (with secrets already encrypted), fetch it first with
`doctl apps spec get <app-id> > digitalocean-app.yaml` and edit that.

## Backups

* **MySQL:** daily backups with point-in-time restore, under **Databases → eve-mysql → Backups**.
  Restoring creates a new cluster; attach it in the app spec under the same component name `db`.
* **Valkey:** nothing worth keeping (queues refill, cache rebuilds; users sign in again).
* **Spaces:** only sponsor banners. Copy them off with any S3 tool (`s3cmd`, `rclone`) if you want
  your own copy; enabling bucket versioning protects against deletes.
* **`APP_KEY`** and your filled-in spec, kept privately.

## Optional features

Add these to `envs` in the spec: `WEBPUSH_VAPID_SUBJECT`, `WEBPUSH_VAPID_PUBLIC_KEY`,
`WEBPUSH_VAPID_PRIVATE_KEY` (generate with `php artisan notifications:vapid-keys` in the `worker`
Console), `DISCORD_INVITE_URL`, `APP_THEME` (bundled themes only: there is no `themes/` mount here).

## Troubleshooting

| Symptom | Check |
|---|---|
| `migrate` fails: "Unable to create or change a table without a primary key" | `sql_require_primary_key` is still on (step 1.2); fix it and redeploy |
| `migrate` fails: "Connections using insecure transport are prohibited" | `DB_CA_CERT` is not set to `${db.CA_CERT}`, or `MYSQL_ATTR_SSL_CA` is also set and points at a missing file |
| `worker` restarts with Redis connection errors | `REDIS_SCHEME` is not `tls`, or the Valkey cluster is not attached under the name used in `${queue....}` |
| Jobs run twice, or batches never finish | The queue cluster's eviction policy is not `noeviction` |
| Redirect loops or `http://` links | `TRUSTED_PROXIES` is not `*` |
| "Invalid callback" after EVE login | `EVE_REDIRECT_URI` must equal the callback URL in your EVE application exactly, on your own domain |
| Sponsor upload fails, or banners do not load | `AWS_*` values; the access key needs write access to the bucket; `AWS_URL` must be the bucket's public URL (open it plus `/sponsors/<file>` in a browser) |
| Pages empty, no prices | `/api/v1/health` `setup`; are `worker` and `scheduler` running? `doctl apps logs <app-id> worker` |

Anything else: the general [troubleshooting table](README.md#troubleshooting).
