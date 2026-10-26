#!/usr/bin/env bash
# Update every part of an Eve Industrialist install: the stack files (compose files,
# Caddyfile, .env.example, these scripts) and all images, then restart and wait for health.
# Migrations run automatically in the one-off migrate service. .env is never replaced.
#
#   ./update.sh                  update to the newest files and images for EVE_VERSION
#   ./update.sh --version 1.2.3  switch EVE_VERSION in .env first, then update
#   ./update.sh --backup         run ./backup.sh first
#   ./update.sh --skip-files     only pull images and restart (keep hand-edited files)
#
# Also works piped from inside the install folder:
#   curl -fsSL https://raw.githubusercontent.com/Eve-Industry/eve-industry/main/deploy/update.sh | bash
# The previous files are kept in .previous/. EVE_RAW_URL overrides where files come from.
#
# Provided as is, without warranty. See LICENSE (AGPL-3.0).
set -euo pipefail

FILES="docker-compose.yml docker-compose.no-proxy.yml Caddyfile .env.example update.sh update.ps1 backup.sh restore.sh"
REPO_RAW="https://raw.githubusercontent.com/Eve-Industry/eve-industry"
TMP_DIR=""
trap 'rm -rf "${TMP_DIR:-}"' EXIT

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }
env_value() { sed -n "s/^$1=//p" .env | tail -1 | sed 's/^"\(.*\)"$/\1/'; }
project_name() { { docker compose config 2>/dev/null || true; } | sed -n 's/^name: //p' | head -1; }

# The whole script lives in main so bash has read all of it before update.sh is replaced.
main() {
  local version="" backup="" skip_files=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --version) [ $# -ge 2 ] || die "--version needs a value, e.g. --version 1.2.3"; version="${2#v}"; shift 2 ;;
      --version=*) version="${1#--version=}"; version="${version#v}"; shift ;;
      --backup) backup=1; shift ;;
      --skip-files) skip_files=1; shift ;;
      -h|--help) sed -n '2,15p' "${BASH_SOURCE[0]:-/dev/null}" 2>/dev/null || true; exit 0 ;;
      *) die "Unknown option: $1 (see --help)" ;;
    esac
  done

  # Run from the script's folder; piped through bash there is no script file, so only
  # accept INSTALL_DIR or the current directory when it looks like an install.
  local dir
  if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  else
    dir="${INSTALL_DIR:-$PWD}"
  fi
  cd "$dir"
  [ -f .env ] || die "No .env in $dir. Run this from your install folder, or install first (install.sh)."
  [ -f docker-compose.yml ] && grep -q 'EVE_VERSION' docker-compose.yml \
    || die "$dir does not look like an Eve Industrialist install (no matching docker-compose.yml)."

  command -v docker >/dev/null || die "Docker is not installed."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command)."

  if [ -n "$version" ]; then
    case "$version" in *[!A-Za-z0-9._-]*|'') die "Invalid version: $version" ;; esac
    if grep -q '^EVE_VERSION=' .env; then
      sed -i.bak "s/^EVE_VERSION=.*/EVE_VERSION=$version/" .env && rm -f .env.bak
    else
      printf '\nEVE_VERSION=%s\n' "$version" >> .env
    fi
    say "EVE_VERSION set to $version"
  fi

  if [ -n "$backup" ]; then
    say "Backing up"
    ./backup.sh
  fi

  if [ -z "$skip_files" ]; then
    command -v curl >/dev/null || die "curl is required (or use --skip-files)."
    # Stack files match the pinned image (its release tag); the helper scripts always come
    # from main, so an older pin never downgrades this updater.
    local current stack_source script_source src f
    current="$(env_value EVE_VERSION)"
    current="${current#v}"
    script_source="${EVE_RAW_URL:-$REPO_RAW/main/deploy}"
    if [ -n "${EVE_RAW_URL:-}" ]; then
      stack_source="$EVE_RAW_URL"
    elif printf '%s' "$current" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
      stack_source="$REPO_RAW/v$current/deploy"
    else
      stack_source="$REPO_RAW/main/deploy"
    fi

    say "Downloading stack files from $stack_source"
    TMP_DIR="$(mktemp -d)"
    for f in $FILES; do
      case "$f" in *.sh|*.ps1) src="$script_source" ;; *) src="$stack_source" ;; esac
      curl -fsSL "$src/$f" -o "$TMP_DIR/$f" || die "Could not download $f from $src. Nothing was changed."
    done

    local old_project
    old_project="$(project_name)"

    rm -rf .previous
    mkdir -p .previous themes
    for f in $FILES; do [ -f "$f" ] && cp -p "$f" ".previous/$f"; done
    # mv gives each file a new inode, so the copy of update.sh being run is untouched.
    for f in $FILES; do mv -f "$TMP_DIR/$f" "$f"; done
    chmod +x update.sh backup.sh restore.sh

    local err
    if ! err="$(docker compose config -q 2>&1)"; then
      for f in $FILES; do
        if [ -f ".previous/$f" ]; then cp -p ".previous/$f" "$f"; else rm -f "$f"; fi
      done
      printf '%s\n' "$err" >&2
      die "The new compose file does not accept your .env (see above; usually a new REQUIRED setting from .env.example). The previous files were restored."
    fi

    # Older compose files took the project name from the folder. Keep that name, or the new
    # file would start a second, empty stack next to the running one.
    local new_project
    new_project="$(project_name)"
    if [ -n "$old_project" ] && [ "$old_project" != "$new_project" ] && ! grep -q '^COMPOSE_PROJECT_NAME=' .env \
      && [ -n "$(docker compose -p "$old_project" ps -a -q 2>/dev/null)" ]; then
      printf '\nCOMPOSE_PROJECT_NAME=%s\n' "$old_project" >> .env
      say "Kept the existing project name $old_project (COMPOSE_PROJECT_NAME in .env)"
    fi

    local missing
    missing="$(comm -23 <(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' .env.example | sort -u) \
                        <(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' .env | sort -u))"
    if [ -n "$missing" ]; then
      say "Settings in .env.example that your .env does not set (optional unless marked REQUIRED there):"
      printf '  %s\n' $missing
    fi
    echo "Stack files updated (previous copies in .previous/)."
  fi

  say "Pulling images"
  [ -n "${EVE_SKIP_PULL:-}" ] || docker compose pull

  say "Restarting"
  docker compose up -d --remove-orphans
  docker image prune -f >/dev/null

  say "Waiting for the app to become healthy"
  local state="" _
  for _ in $(seq 1 90); do
    state="$(docker compose ps web --format '{{.Health}}' 2>/dev/null || true)"
    [ "$state" = "healthy" ] && break
    sleep 5
  done
  [ "$state" = "healthy" ] || die "The web container did not become healthy. Check: docker compose logs web migrate"

  say "Update finished"
  echo "  App:     $(env_value APP_URL)"
  echo "  Version: $(env_value EVE_VERSION)"
  echo "  Status:  docker compose ps"
}

main "$@"
