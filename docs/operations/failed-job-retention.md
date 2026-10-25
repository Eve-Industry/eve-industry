# SQL failed-job retention

The `queue:prune-failed` scheduled command is disabled by default. SQL failed-job records contain the payload and exception needed to diagnose terminal failures; preserve representative recent samples and investigate recurring categories before enabling cleanup.

To opt in, set `FAILED_JOBS_RETENTION_ENABLED=true` and choose `FAILED_JOBS_RETENTION_DAYS` (default 90, minimum 1). The daily command deletes records older than the cutoff in bounded batches of at most 500 rows. It does not replay jobs, truncate the table, or change Horizon's separate job and metric retention settings. Keep `FAILED_JOBS_RETENTION_ENABLED=false` until operators have captured the diagnostics they need.
