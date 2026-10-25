# ESI scaling rollout

This change targets the measured pre-migration cohort of 26 eligible users and 117 active characters, with 2,704 linked characters overall. A target of 2,000 simultaneously eligible characters is 17.09 times the current active cohort. Local regression and concurrency checks do not establish production capacity at that target.

## Deployment sequence

1. Back up MySQL and retain representative failed-job records. Check disk headroom for the new SQL inventory tables and retained market/contract generations. Asset items store both raw and enriched payloads; size this from actual asset row counts, not registered characters or the largest Redis keys.
2. Stop scheduled dispatch and drain/restart workers during migration and release. Run the new dated migrations before starting application processes that read the new tables. The contract migration copies existing data into a published generation in bounded batches; allow time and storage for that copy.
3. Configure the persistent Redis instance with `noeviction` for queues, locks, ESI budgets and sessions. The disposable HTTP cache can use `allkeys-lru`. Keep every process behind one egress IP on the same `ESI_SOURCE_IDENTITY`, coordination store and application identity; a separate application or egress must not accidentally bypass a shared budget. Set `ESI_USER_AGENT` to an identifiable application/contact URL.
4. Deploy compatible token readers everywhere with `ESI_ENCRYPT_TOKENS=false`. Keep the existing stable `APP_KEY` and backups. Only after all web and queue processes have this reader, enable `ESI_ENCRYPT_TOKENS=true`, restart them, preview `php artisan esi:encrypt-tokens`, then run it with `--write`. Never roll back to a plaintext-only reader after encryption begins. An unavailable encryption key prevents token use.
5. Enable `ASSET_DURABLE_SNAPSHOTS=true` (default). Leave `ASSET_LEGACY_CACHE_DUAL_WRITE=false`; this stops writing the observed multi-megabyte per-user Redis projections. Existing SQL generations remain readable after cache eviction. The first eligible refresh creates each owner's initial inventory; the UI reports pending until that completes. Start with the existing active cohort, inspect the resulting inventory counts, then expand eligibility gradually. Do not bulk-reactivate the 2,587 inactive characters without establishing why they became inactive.
6. Restart Horizon and scheduler processes with the new configuration. Profile refreshes now dispatch staggered jobs; assets, industry and dashboard work recheck eligibility at execution. Keep the current five-process production cap until latency, error budgets, SQL contention and memory measurements justify a change.

Changing `SESSION_CONNECTION` from `cache` to `sessions` moves sessions to the persistent Redis instance (database 2 by default) and can require users to sign in again. Review any explicit environment overrides; configuration defaults do not override deployed variables. Monitor persistent Redis memory and persistence health.

## Retention and rollback

Preview `php artisan market:snapshots-prune` before enabling scheduled cleanup; see `snapshot-generation-retention.md`. Asset publication retains the active and previous complete snapshots and a one-day grace for older generations. Monitor abandoned `building`/`staging` records after hard worker termination: the automatic policies deliberately preserve these records for investigation. Regular asset pruning occurs during successful owner refreshes, so dormant owners can retain older records.

Failed-job retention remains opt-in. After preserving diagnostics, set `FAILED_JOBS_RETENTION_ENABLED=true` with a deliberate retention period. See `failed-job-retention.md`. The measured logical payload sizes and allocated InnoDB space are different measurements; deleting rows does not guarantee the same amount of disk is returned to the filesystem.

Keep migrations and compatible readers in place for an application rollback. Market/contract generation migrations change reader semantics; do not blindly run migration rollback against live snapshots. Turning durable assets off reads the old Redis representation, which can be stale unless dual writing was explicitly enabled during a short compatibility period. Do not flush queues or coordination Redis as a rollback step.

## Acceptance measurements

Record actual requests and token cost by ESI rate-limit group, status, dataset and owner; 420/429 deferrals; global error-budget minimum/reset; refresh-token outcomes; eligible collector counts; pages per inventory; source freshness and snapshot age; pending enrichments; queue wait/run time and peak worker RSS; SQL rows/storage, query duration and lock retries; Redis total bytes/evictions. Role or membership denials should suppress repeat calls until their bounded denial window expires. Transient SSO/ESI failures must not deactivate otherwise valid characters.

Exercise a 36-character account and the largest observed inventory, partial pagination failure, a successful empty inventory, simultaneous shared-corporation refreshes, cache loss and access revocation. Expand through 117, 500, 1,000 and 2,000 eligible characters using observed per-owner request/page counts. Set acceptable freshness and queue-age targets before each stage. Production validation, disk sizing and operational metrics remain release gates; no production systems were changed by the local tests.
