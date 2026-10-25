# Changelog

All notable changes are listed here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versions follow SemVer.

## [Unreleased]

## [1.0.1] - 2026-10-25

### Added
- Installer: selectable port (`PORT`, default 80; default 8080 with `PROXY=none`) for
  `DOMAIN=localhost` and bring-your-own-proxy installs. A public domain with the bundled Caddy
  must use ports 80 and 443.
- Installer: `EVE_NO_START` writes the configuration without starting the stack.

### Fixed
- Installer (`install.sh`): when piped through `curl | bash` it could copy an unrelated
  `docker-compose.yml` from the current directory over the downloaded one.
- Installer (both scripts): without a terminal (ssh without a tty, CI, containers) they now use
  the default instead of exiting silently.
- Compose: the project name is fixed to `eve-industry` (override with `COMPOSE_PROJECT_NAME`).
  Before, it came from the install folder, so a folder named like an existing project replaced that
  project's containers and reused its database volume.

### Changed
- Faster multi-architecture image builds: the frontend build now runs on the build machine's own
  architecture instead of under emulation.

## [1.0.0] - 2026-10-25

First public release.

### Added
- AGPL-3.0-or-later licence, NOTICE, contributing and security docs.
- Docker self-hosting: published multi-architecture image (`ghcr.io/eve-industry/eve-industry`),
  Compose stack with automatic HTTPS through Caddy, installers for Linux/macOS and Windows,
  update, backup and restore scripts.
- First-run setup (`php artisan app:install`): admin account with a generated password, game-data
  import, and setup progress in `GET /api/v1/health`.
- Switchable themes (`APP_THEME`) and a styling guide; the built-in look is the default.
- Daily log files, five days kept (`LOG_DAILY_DAYS`).
- Configurable community link (`DISCORD_INVITE_URL`) and source link (`APP_SOURCE_URL`).

### Changed
- Laravel 12, PHP 8.5, Node 26.
- The image runs as an unprivileged user.

### Removed
- Admin account impersonation.
- Bundled third-party sponsor banners and legacy branding.
