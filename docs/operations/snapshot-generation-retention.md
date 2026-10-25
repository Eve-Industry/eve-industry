# Snapshot generation retention

`market:snapshots-prune` previews cleanup by default. Add `--write` to delete rows; the daily scheduled run passes `--write` and can be paused with `SNAPSHOT_RETENTION_ENABLED=false`.

Market aggregate cleanup retains each region's active sweep, at least its two newest completed generations, and every completed generation from the last three hours. The three-hour grace exceeds the two-hour per-sweep price cache lifetime. Regions with a running or completing sweep are skipped, and each bounded deletion rechecks the durable active pointer under its row lock.

Public contracts retain the active generation, at least the two newest published generations, and published generations from the last three hours. Failed and superseded import generations remain available for one day for diagnostics. Contract snapshot cleanup shares a distributed writer lock with imports, rechecks the active pointer, and deletes items before contracts in batches of 500. The importer stages rows in `building` status; those rows are not pruned by this command.

The command does not prune `failed_jobs`, raw market orders, or sweep diagnostic rows. SQL failed-job retention has its own opt-in policy in `docs/operations/failed-job-retention.md`.
