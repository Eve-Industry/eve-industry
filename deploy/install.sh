#!/usr/bin/env bash
# Eve Industrialist installer (Linux / macOS / WSL).
#
#   curl -fsSL https://raw.githubusercontent.com/Eve-Industry/eve-industry/main/deploy/install.sh | bash
#
# It asks a few questions, writes .env with generated secrets, pulls the image
# and starts the stack. Re-running never overwrites an existing .env.
# Non-interactive: set DOMAIN, EVE_CLIENT_ID, EVE_CLIENT_SECRET, ESI_CONTACT,
# ADMIN_EMAIL (and optionally PORT, PROXY=none, EVE_VERSION, INSTALL_DIR) beforehand.
# PORT defaults to 80 (8080 with PROXY=none) and can be changed for DOMAIN=localhost
# or PROXY=none, e.g. PORT=8080 DOMAIN=localhost for http://localhost:8080.
#
# Provided as is, without warranty. See LICENSE (AGPL-3.0).
set -euo pipefail

RAW_URL="${EVE_RAW_URL:-https://raw.githubusercontent.com/Eve-Industry/eve-industry/main/deploy}"
INSTALL_DIR="${INSTALL_DIR:-$PWD/eve-industrialist}"
# Use sibling files only when this is a real file inside a deploy/ checkout. Piped
# through `curl | bash` there is no script file, and the current directory must not
# be trusted (it may hold an unrelated docker-compose.yml).
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  _dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$_dir/docker-compose.yml" ] && [ -f "$_dir/Caddyfile" ] && [ "$(basename "$_dir")" = "deploy" ]; then SCRIPT_DIR="$_dir"; fi
fi

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }
ask() { # ask VAR "Question" [default] [secret]
  local var="$1" prompt="$2" default="${3:-}" secret="${4:-}" value
  if [ -n "${!var:-}" ]; then return; fi
  # No terminal to ask on (ssh without a tty, CI, containers): -r /dev/tty can be true
  # even though opening it fails, so test that it actually opens.
  if [ ! -t 0 ] && ! { : </dev/tty; } 2>/dev/null; then
    [ -n "$default" ] && { printf -v "$var" '%s' "$default"; return; }
    die "$var is required (set it in the environment when running non-interactively)."
  fi
  while :; do
    if [ -n "$secret" ]; then read -r -s -p "$prompt: " value </dev/tty; echo; else
      read -r -p "$prompt${default:+ [$default]}: " value </dev/tty; fi
    value="${value:-$default}"
    [ -n "$value" ] && break
    echo "A value is required."
  done
  printf -v "$var" '%s' "$value"
}
rand() { openssl rand -base64 "$1" | tr -d '/+=\n' | cut -c1-"$2"; }

command -v docker >/dev/null || die "Docker is not installed. See https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command)."
command -v openssl >/dev/null || die "openssl is required to generate secrets."
command -v curl >/dev/null || die "curl is required."

say "Installing into $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/themes"
cd "$INSTALL_DIR"

fetch() { # fetch FILE
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/$1" ]; then cp "$SCRIPT_DIR/$1" "$1"; else curl -fsSL "$RAW_URL/$1" -o "$1"; fi
}
for f in docker-compose.yml docker-compose.no-proxy.yml Caddyfile .env.example update.sh update.ps1 backup.sh restore.sh; do fetch "$f"; done
chmod +x update.sh backup.sh restore.sh

if [ -f .env ]; then
  say ".env already exists, keeping it."
else
  # MySQL sets its passwords only when it first creates its volume, so a new .env
  # (with new passwords) cannot work against data left by an earlier install.
  db_volume="${COMPOSE_PROJECT_NAME:-eve-industry}_mysql-data"
  if docker volume inspect "$db_volume" >/dev/null 2>&1; then
    die "There is no .env in $INSTALL_DIR, but the database volume $db_volume from an earlier install still exists.
A new .env would have new passwords that this database rejects. Either:
  - keep that data: put the earlier .env back in $INSTALL_DIR and run this installer again, or
  - delete it (all data from the earlier install is lost): run 'docker compose down -v' in $INSTALL_DIR, then run this installer again."
  fi

  ask DOMAIN "Public domain name (or 'localhost' to try it locally)" "localhost"
  PROXY="${PROXY:-caddy}"

  # The port people connect to. Selectable for localhost and when you bring your own
  # proxy (PROXY=none, where it is the port web listens on at 127.0.0.1). A public
  # domain with the bundled Caddy needs 80 and 443 for automatic HTTPS.
  if [ "$DOMAIN" = "localhost" ] || [ "$PROXY" = "none" ]; then
    if [ "$PROXY" = "none" ]; then port_default=8080; else port_default=80; fi
    ask PORT "HTTP port to listen on" "$port_default"
  else
    PORT="${PORT:-80}"
    [ "$PORT" = "80" ] || die "Automatic HTTPS needs ports 80 and 443. Use DOMAIN=localhost or PROXY=none to choose another port."
  fi
  case "$PORT" in ''|*[!0-9]*) die "PORT must be a number between 1 and 65535." ;; esac
  { [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; } || die "PORT must be a number between 1 and 65535."

  say "Create an application at https://developers.eveonline.com"
  if [ "$DOMAIN" = "localhost" ]; then
    if [ "$PORT" = "80" ]; then APP_URL="http://localhost"; SITE_ADDRESS="http://localhost"; else APP_URL="http://localhost:$PORT"; SITE_ADDRESS="http://localhost:$PORT"; fi
  else
    APP_URL="https://$DOMAIN"; SITE_ADDRESS="$DOMAIN"
  fi
  echo "  Callback URL: $APP_URL/auth/eve/callback"
  echo "  Scopes: see docs/self-hosting/eve-sso.md (enable every scope listed there)"
  ask EVE_CLIENT_ID "EVE client ID"
  ask EVE_CLIENT_SECRET "EVE client secret" "" secret
  ask ESI_CONTACT "Contact email for CCP (sent in the ESI user agent)"
  ask ADMIN_EMAIL "Admin email address" "$ESI_CONTACT"

  {
    cat <<EOF
APP_NAME="Eve Industrialist"
APP_URL=$APP_URL
SITE_ADDRESS=$SITE_ADDRESS
APP_KEY=base64:$(openssl rand -base64 32)
EVE_VERSION=${EVE_VERSION:-latest}
${EVE_IMAGE:+EVE_IMAGE=$EVE_IMAGE}
EVE_CLIENT_ID=$EVE_CLIENT_ID
EVE_CLIENT_SECRET=$EVE_CLIENT_SECRET
EVE_REDIRECT_URI=$APP_URL/auth/eve/callback
ESI_USER_AGENT="EveIndustrialist/2.0 ($ESI_CONTACT; +$APP_URL)"
ESI_ENCRYPT_TOKENS=true
SUPER_ADMIN_NAME="Super Admin"
SUPER_ADMIN_EMAIL=$ADMIN_EMAIL
SUPER_ADMIN_PASSWORD=
DB_DATABASE=eve_industrialist
DB_USERNAME=eve_industrialist
DB_PASSWORD=$(rand 32 32)
DB_ROOT_PASSWORD=$(rand 32 32)
LOG_CHANNEL=daily
LOG_DAILY_DAYS=5
LOG_LEVEL=warning
EOF
    if [ "$PROXY" = "none" ]; then
      echo "COMPOSE_FILE=docker-compose.yml:docker-compose.no-proxy.yml"; echo "WEB_PORT=$PORT"
    else
      echo "HTTP_PORT=$PORT"
    fi
  } > .env
  chmod 600 .env
  say "Wrote .env (back up APP_KEY: losing it makes encrypted data unreadable)."
fi

if [ -n "${EVE_NO_START:-}" ]; then
  say "EVE_NO_START is set: configuration written, nothing started."
  exit 0
fi

say "Pulling images"
[ -n "${EVE_SKIP_PULL:-}" ] || docker compose pull

say "Starting the stack"
docker compose up -d

say "Waiting for the app to become healthy (first start can take a few minutes)"
for _ in $(seq 1 90); do
  state="$(docker compose ps web --format '{{.Health}}' 2>/dev/null || true)"
  [ "$state" = "healthy" ] && break
  sleep 5
done
[ "$state" = "healthy" ] || die "The web container did not become healthy. Check: docker compose logs web migrate"

password=""
for _ in $(seq 1 60); do
  password="$(docker compose logs install 2>/dev/null | sed -n 's/.*Generated admin password.*: //p' | tail -1)"
  [ -n "$password" ] && break
  docker compose logs install 2>/dev/null | grep -q "Super admin already exists" && break
  sleep 3
done

APP_URL_NOW="$(sed -n 's/^APP_URL=//p' .env)"
say "Done"
echo "  App:    $APP_URL_NOW"
echo "  Admin:  $APP_URL_NOW/admin/login  ($(sed -n 's/^SUPER_ADMIN_EMAIL=//p' .env))"
if [ -n "$password" ]; then echo "  Password (shown once, change it after signing in): $password"; fi
echo
echo "Game data (items, prices) imports in the background and can take a while."
echo "Progress: curl -s $APP_URL_NOW/api/v1/health"
echo "Update later with ./update.sh, back up with ./backup.sh"
