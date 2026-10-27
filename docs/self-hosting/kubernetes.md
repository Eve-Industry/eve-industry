# Kubernetes

Provided as is, without warranty (AGPL-3.0). For a single host, Docker Compose ([README.md](README.md))
is simpler; use this when you already run a cluster.

The Helm chart is in [`deploy/helm/eve-industry`](../../deploy/helm/eve-industry). It runs the same
release image as Compose, one role per workload:

| Workload | Kind | Role |
|---|---|---|
| `web` | Deployment + Service (+ Ingress) | nginx + PHP-FPM on port 8080 |
| `worker` | Deployment, 1 pod | Horizon (default, market and updates queues; at most 5 processes) |
| `scheduler` | Deployment, exactly 1 pod | `schedule:work` |
| `migrate-<hash>` | Job, one per release revision | `php artisan migrate --force` |
| `install` | Job, first install only | Admin account and first game-data import |
| `mysql` | StatefulSet (optional) | MySQL 8.0 |
| `redis` | StatefulSet (optional) | Queues, Horizon, locks, sessions: `noeviction`, append-only file |
| `redis-cache` | Deployment (optional) | Cache: `allkeys-lru`, no persistence |

Every app pod has an `await-migrations` init container: it waits until the database has no pending
migrations. The migrate Job and the new pods are created together, so pods start on a current
schema without Helm hooks. That works with `helm --wait`, Argo CD and Flux alike.

App pods run as `www-data` (uid 33) with a read-only root filesystem, no capabilities and no
service account token. Writable paths are `emptyDir` volumes (`/tmp`, `storage/`,
`bootstrap/cache`); uploaded files (sponsor images) go on a PersistentVolumeClaim mounted on the
web pods only. Logs go to the container output (`LOG_CHANNEL=stderr`), so `kubectl logs` shows
them.

## Requirements

* Kubernetes 1.25 or later, Helm 3
* An ingress controller (or Gateway) with TLS, e.g. ingress-nginx and cert-manager
* A default StorageClass, or set the `storageClass` values
* An EVE application: [eve-sso.md](eve-sso.md). Callback URL: `<app.url>/auth/eve/callback`
* About 2 CPU cores and 4 GB memory for the whole release, more as the market tables grow

## Install

The chart is not published to a chart repository yet; install it from a checkout of the release
tag you want to run. It needs image 1.0.4 or later (the `await-migrations` role).

```bash
git clone --depth 1 --branch v1.0.4 https://github.com/Eve-Industry/eve-industry.git
```

Create the Secret yourself, so it never sits in a values file:

```bash
kubectl create namespace eve-industry
kubectl -n eve-industry create secret generic eve-industry-secrets \
  --from-literal=APP_KEY="base64:$(openssl rand -base64 32)" \
  --from-literal=EVE_CLIENT_ID=... \
  --from-literal=EVE_CLIENT_SECRET=... \
  --from-literal=DB_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
```

Back up `APP_KEY`: without it encrypted data (ESI refresh tokens) is unreadable. Optional keys:
`REDIS_PASSWORD`, `SUPER_ADMIN_PASSWORD`, `WEBPUSH_VAPID_PRIVATE_KEY`. Every key becomes an
environment variable. (Alternatively put them under `secrets:` in your values and the chart
creates the Secret.)

Then a values file, e.g. `values.prod.yaml`:

```yaml
image:
  tag: "1.0.4"
app:
  url: https://eve.example.com
  esiUserAgent: "EveIndustrialist/2.0 (you@example.com; +https://eve.example.com)"
  superAdmin:
    email: you@example.com
existingSecret: eve-industry-secrets
ingress:
  enabled: true
  className: nginx
  host: eve.example.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
    nginx.ingress.kubernetes.io/proxy-body-size: 50m
  tls:
    enabled: true
```

```bash
helm install eve-industry ./eve-industry/deploy/helm/eve-industry \
  -n eve-industry -f values.prod.yaml
kubectl -n eve-industry logs -f job/eve-industry-install -c install
```

The install Job prints the generated admin password once (if `SUPER_ADMIN_PASSWORD` is not set)
and imports the static game data, then queues the first Jita sweep. Its log is kept for 7 days.
Progress: `curl -s https://eve.example.com/api/v1/health` (see "First start" in
[README.md](README.md)). All settings and their defaults are in
[`values.yaml`](../../deploy/helm/eve-industry/values.yaml); other environment variables
(`DEMO_ENABLED`, `WEBPUSH_VAPID_PUBLIC_KEY`, ...) go under `env:`.

## Updating

```bash
cd eve-industry && git fetch --tags && git checkout v1.0.5
helm upgrade eve-industry ./deploy/helm/eve-industry -n eve-industry -f values.prod.yaml \
  --set image.tag=1.0.5
```

Each upgrade creates a new migrate Job. New pods wait for it while the old ones keep serving; the
worker and scheduler are replaced (never two at once), web rolls one pod at a time when its
uploads volume is `ReadWriteMany`, otherwise it is recreated. Changing the ConfigMap or the
chart-managed Secret restarts the pods. If you manage the Secret yourself, restart after changing
it: `kubectl -n eve-industry rollout restart deploy`.

With Argo CD or Flux, set `install.enabled: false` once the first install has finished; the migrate
Job's name changes with the image, so it reruns on every image update.

## Using your own database and Redis

The bundled MySQL and Redis are single pods with no replication or backups of their own. To use
managed services:

```yaml
mysql:
  enabled: false
externalDatabase:
  host: mysql.internal
  database: eve_industrialist
  username: eve_industrialist
redis:
  enabled: false
externalRedis:
  host: redis-queue.internal        # must not evict: maxmemory-policy noeviction
  cacheHost: redis-cache.internal   # optional; allkeys-lru. Empty = database 1 on host
```

`DB_PASSWORD` (and `REDIS_PASSWORD`, if any) stay in the Secret; `DB_ROOT_PASSWORD` is not needed.
See [esi-scaling.md](../operations/esi-scaling.md) for why the two Redis roles differ.

## Scaling

* **web** scales horizontally once uploads are on `ReadWriteMany` storage
  (`persistence.accessMode`), or with `persistence.enabled: false` if you do not use sponsor
  images or keep them in a bucket (`UPLOADS_DISK=s3` under `env`, the `AWS_*` settings from
  `deploy/.env.example`, `AWS_SECRET_ACCESS_KEY` in `secrets.extra`). Then set `web.replicas` or `web.autoscaling.enabled`. The chart refuses more than one web
  pod on a `ReadWriteOnce` volume.
* **worker** stays at one pod. Horizon's process counts (`config/horizon.php`, at most 5) are sized
  against ESI rate limits; a second pod doubles them.
* **scheduler** is always one pod.

## Backups

```bash
kubectl -n eve-industry exec statefulset/eve-industry-mysql -- \
  sh -c 'exec mysqldump --single-transaction -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > eve-industry-$(date +%F).sql.gz
```

Also keep the Secret (above all `APP_KEY`) and the uploads volume. PersistentVolumeClaims are kept
on `helm uninstall`; delete them yourself to remove the data.

## Troubleshooting

* **Pods stuck in `Init:0/1`:** they are waiting for migrations. Check the Job:
  `kubectl -n eve-industry logs -l app.kubernetes.io/component=migrate`.
* **Redirects to `http://` or a wrong host:** `app.url` must be the public `https://` URL, and the
  ingress controller's pod IPs must be in `app.trustedProxies` (the default covers private ranges).
* **Uploads fail with 413:** raise the ingress body size limit (see the values example above).
* **Lost admin password:** set `SUPER_ADMIN_PASSWORD` in the Secret, restart, then
  `kubectl -n eve-industry exec deploy/eve-industry-web -- php artisan admin:reset`.
* **Push notification keys:**
  `kubectl -n eve-industry exec deploy/eve-industry-worker -- php artisan notifications:vapid-keys`;
  put the private key in the Secret and the public key and subject under `env:`.
* **Horizon dashboard:** `/horizon`, admin users only.
