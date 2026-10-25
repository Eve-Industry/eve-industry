# Contributing

Thanks for helping. This project is provided as is, without warranty or any
promise of support (see [LICENSE](LICENSE)). Maintainers review contributions
when they have time.

## Licence of contributions

The project is licensed under AGPL-3.0-or-later. By contributing you agree your
work is released under the same licence. Sign off each commit to confirm the
[Developer Certificate of Origin](https://developercertificate.org/):

```bash
git commit -s -m "Describe the change"
```

## Setup

Follow `docs/self-hosting/` to run the stack, or use the dev compose file:

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Rules

Read [AGENTS.md](AGENTS.md) first. The short version:

1. Business logic lives in services; controllers stay thin.
2. All ESI calls go through `EsiService`.
3. New recurring work gets a command, a schedule with `withoutOverlapping()->onOneServer()`, and jobs with explicit `$timeout`, `$tries` and queue.
4. Schema changes are new dated migrations; never edit existing ones.
5. Add tests (`php artisan test`, `npm test` in `frontend/`) and format PHP with `vendor/bin/pint`.
6. After API changes regenerate the spec and types:
   `DB_CONNECTION=sqlite DB_DATABASE=:memory: php artisan scramble:export` then `npm run gen:api` in `frontend/`.
7. Styling uses tokens only; see `docs/styling.md`. No raw colours in components.
8. Do not add account impersonation, tracking or analytics that is on by default.

## Pull requests

Work on a branch, keep changes focused, explain the why, and make sure CI is green.
