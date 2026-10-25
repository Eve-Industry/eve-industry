# /api/v1 migration

Checklist for moving the JSON endpoints under `/api/...` in `routes/web.php`
onto the versioned API in `routes/api.php` (mounted at `/api/v1`). Later
slices work through it group by group.

## Rules for every migrated route

- The old `/api/...` route keeps returning exactly what it returns today.
  A characterisation test pins its current response before any refactor.
- Logic moves out of the old controller into a service that both the old and
  the new route call. The v1 controller (`App\Http\Controllers\Api\V1\...`)
  stays thin: a FormRequest for input, the service, and an API Resource.
- Responses use the envelope in `App\Http\Responses\ApiResponse`:
  `{data, meta}`; `ApiResponse::paginated()` for lists, with default 50 and
  max 200 per page where the old route returned an unbounded list (only the
  v1 version paginates); `meta.freshness` from
  `MarketFreshnessService::freshnessMeta()` on anything carrying prices or
  costs. Errors are `{message, errors?, code}`.
- Auth matches the old route. Every old route below needs a login, so every
  v1 route sits under `auth:sanctum`. Extra checks (stock manager, admin,
  corporation roles) become middleware or policies on the v1 route and
  return 403 with `code: forbidden`.
- Each group has its own route file, `routes/api_v1/<group>.php`, required
  from `routes/api.php`. `docs/openapi.json` is regenerated once after all
  groups are merged.
- Several old routes collapse onto one v1 endpoint (e.g. six system
  searches → `GET /api/v1/systems?q=`). The old routes keep their own
  quirks (prefix vs substring match, field names); the v1 endpoint picks one
  documented behaviour.

## Groups

| Group | Routes | Slice |
|---|---|---|
| Read-only reference: SDE lookups, search, types, blueprints, systems, stations, market groups | 26 | done (B4) |
| Market: station trading, arbitrage, appraisal (plus new prices, history, orders) | 3 | done (B4) |
| Corp, assets and stock | 6 | done (B4) |
| Calculators: manufacturing, invention, reactions, factory planner, queue summary | 15 | done (B4) |
| Heavy pages | 12 | done (B5) |
| Write / other (CRUD on plans, configs, structures, build programs, wholemap, stock items; refresh triggers) | 49 | done (B5) |
| **Total** | **111** | all migrated |

The market group also gets new v1 endpoints with no old route:
`GET /api/v1/market/prices?type_ids[]=&region_id=`,
`GET /api/v1/market/history/{typeId}?region_id=` and
`GET /api/v1/market/orders?type_id=&region_id=`.

Status: **done (B4)** / **done (B5)** = migrated in that slice (see the decisions
sections below for any path that changed during the work).

Every one of the 111 routes now has a v1 equivalent; none is kept web-only. The
old `/api/...` routes stay in `routes/web.php` as aliases that call the same
services, because the Blade pages still use them. Each one has a
characterisation test (`tests/Feature/LegacyApi/`) pinning its response until
the pages move to v1 and the alias can be removed. Routes outside `/api/...`
(EVE SSO login and callback, admin login, the Blade pages themselves) are web
pages, not JSON endpoints, and are not part of this checklist.

## B4 decisions

Characterisation tests for every migrated old route are in
`tests/Feature/LegacyApi/<Group>/`; v1 tests are in `tests/Feature/ApiV1/<Group>/`.
Route names are `api.v1.<group>.*`.

**Reference** (services in `App\Services\Reference\`)
- Extra v1 endpoints: `GET /api/v1/stations/{stationId}` and
  `GET /api/v1/systems/{systemId}/stations` (paginated; the old per-system station
  list had no cap).
- The reaction planner's search and reaction-data return the same data as the
  reactions calculator, so both share `/reactions/formulas`; no separate planner path.
- Searches: `q` required, 2–100 chars; capped lists with `meta.limit` (20; types 50;
  corporations 10) instead of `meta.pagination`. Market groups, the tree and
  categories are small fixed lists, returned unpaginated.
- `/systems?q=` is a substring match on the SDE only (old routes vary: prefix vs
  substring, some fall back to ESI). `/systems/{id}/cost-indices` returns all six
  activities, 404 for an unknown system and 503 when ESI is down (old routes return 0s).
- `exclude_meta_groups` is array-only in v1; corporation results use `corporation_id`.

**Market**
- `region_id` must be one of the five trade hubs (old routes accept any integer).
- Station trading and arbitrage paginate the full result (old `limit` param dropped).
- Arbitrage: `meta.freshness` is the buy region's; `meta.freshness_by_region` has both.
- Appraisals price from public contracts across all regions, so their freshness comes
  from `MarketFreshnessService::contractsFreshnessMeta()` (last contract import).
- `GET /market/contracts` and `GET /market/contracts/{contractId}` (D6) back the Contract browser: newest first,
  `meta.stats` counts all contracts by type, `meta.freshness` is the contract import. They have no old `/api` alias.
- New: `/market/prices` (≤200 type ids, not paginated), `/market/history/{typeId}`
  (newest `days` rows, 404 for unknown type), `/market/orders` (best price first).

**Corp** (gates in `App\Policies\CorporationPolicy`, `can:` middleware)
- `corporation.view-assets`: main is Director/CEO with the corp-assets scope. The old
  route had no check (it filtered stale cached rows); v1 returns 403.
- `corporation.view-donations`, `corporation.view-ess`, `corporation.view-projects`
  mirror the old routes' checks; stock search keeps the `stock-manager` middleware.
- Assets, donations, projects and ESS are paginated; totals in `meta.summary`.
  No `meta.freshness`: none of these values come from market prices.
- v1 validates strictly where the old routes silently fell back (sort, dates, division).

**Calculators** (services in `App\Services\Calculators\`)
- The fat calculate controllers' maths now live in `ManufacturingJobCalculator`,
  `InventionJobCalculator`, `ReactionJobCalculator`, `ReactionPlanCalculator`,
  `ManufacturingBrowserCalculator`, `ReactionBrowserCalculator` and
  `FactoryPlannerCalculator`; old and v1 routes both call them.
- v1 responses are restructured (e.g. `scenarios.full_buy` / `full_build`) and drop
  the `*_formatted` strings; every number the old route returns is present.
- Missing `character_id` and an unknown factory tier are 422 in v1 (old: 400);
  manufacturing browser pages at 50/200 (old: 100/100).

## B5 plan

The last phase-B slice moves the remaining 61 routes, in four parallel parts:

| Part | Routes | Route file |
|---|---|---|
| Heavy pages | the 12 heavy-page rows below | `routes/api_v1/heavy.php` |
| Writes A: build programs (personal and corporate), stock-manager items, industry refresh/clear, can-produce refresh, structures CRUD | 22 | `routes/api_v1/writes_programs.php` |
| Writes B: wholemap, invention and reaction plans, station configs, moon-scan occupation | 27 | `routes/api_v1/writes_planning.php` |
| EsiService split into focused clients behind the existing facade; full paging for region orders; B4 dead-code cleanup; assets page director warning | — | — |

Write endpoints follow the same rules as reads, plus:
- a FormRequest for input; a policy or gate for every ownership/permission
  check the old route makes (403 `forbidden`, 404 `not_found` for other users'
  records, matching what the old route does);
- 201 with the created resource for creates, 200 with the resource for updates,
  204 with no body for deletes and for "action" endpoints that return nothing
  useful (refresh, clear); 422 `validation_failed` for bad input;
- CSRF: the SPA calls them with the Sanctum stateful cookie, i.e.
  `GET /sanctum/csrf-cookie` then the `X-XSRF-TOKEN` header. Each writes part
  tests that flow end to end on at least one endpoint.

## B5 decisions

**Policies** (one class and one registration per model)
- `BuildProgramPolicy`, `StationConfigPolicy` (structures and station configs share
  the `StationConfig` model) and `IndustryStockItemPolicy`: owner only; another
  user's record is 404 `not_found`, like the old routes.
- `CorporationBuildProgramPolicy`: view needs the user's active corporate config to be
  for the program's corporation (404 otherwise); create/merge need the feature enabled
  and a Director/CEO or Factory_Manager character (403); update/delete answer 404 for
  every failure, like the old `authorizeManage`.
- `WholemapRecordPolicy` (signatures, connections, notes): owner only, 403.
  `HiddenOwnedRecordPolicy` (invention and reaction plans): owner only, 404.
- `MoonScanResultPolicy` / `MoonScanSystemPolicy`: the acting character's corporation
  must own the scan; no corporation is 422, another corporation's scan is 404.
- Stock items keep the `stock-manager` middleware (403 before anything else).

**Writes**
- Creates 201, updates 200 with the resource, deletes and refresh/clear actions 204,
  bad input 422 `validation_failed`. v1 updates are partial (only sent fields change).
- `PUT /wholemap/notes` is an upsert: 201 when it creates, 200 when it updates.
  `POST /stock/items` is also an upsert and always answers 201.
- The availability clear throttle (30 minutes) is 429 `too_many_requests` in v1;
  the old route redirects with an error.
- Rule failures the old routes reported as `{error}` 422 (no valid reaction-plan
  entries, merging fewer than two programs, editing a locked signature) are
  `validation_failed` with field errors in v1.
- CSRF: `tests/Feature/ApiV1/Programs/CsrfFlowTest.php` and
  `tests/Feature/ApiV1/Planning/CsrfFlowTest.php` run the Sanctum flow
  (`GET /sanctum/csrf-cookie`, then `X-XSRF-TOKEN`): 201 with the header, 419
  `csrf_token_mismatch` without.

**Heavy pages**
- Asset locations, structures, moon-scan systems and moons, and jump logs paginate
  (50/200); the old routes return everything. Availability and reprocessing are small
  per-user lists and are not paginated.
- `POST /moon-scans` stores results: 201 when at least one moon was stored, 200 when the
  paste had no usable moon data.
- `meta.freshness` on reprocessing and moon scans (mineral prices). Build-program progress
  and industry availability carry quantities and slots, not prices, so they have none.

**EsiService**
- Split into clients under `App\Services\Esi\` (HTTP transport, auth, character,
  corporation, universe, market, industry, planetary, SDE); `EsiService` keeps every
  public method and constant and delegates.
- `getMarketRegionAllOrders` returns every order in the region instead of the first 500.

## Phase C decisions

Phase C (fresh market data, deployable split) is recorded in
[`docs/phase-c.md`](phase-c.md). For the API it added `GET /api/v1/health`
(public, no old route) and changed `GET /api/v1/market/freshness`:
`orders_as_of` is now the start of the region's last completed order sweep,
and orders are stale after 2 h instead of 3.

## Routes

### Read-only reference (26)

| Old route | Handler | Auth | v1 target | Status |
|---|---|---|---|---|
| `GET /api/calculators/invention-planner/item-data` | InventionPlannerController@itemData | auth | `GET /api/v1/invention/items/{typeId}` | done (B4); alias removed (D6) |
| `GET /api/calculators/invention-planner/search` | InventionPlannerController@search | auth | `GET /api/v1/invention/items?q=` | done (B4); alias removed (D6) |
| `GET /api/calculators/invention-planner/search-stations` | InventionPlannerController@searchStations | auth | `GET /api/v1/stations?q=` | done (B4); alias removed (D6) |
| `GET /api/calculators/invention-planner/search-systems` | InventionPlannerController@searchSystems | auth | `GET /api/v1/systems?q= / GET /api/v1/systems/{systemId}` | done (B4); alias removed (D6) |
| `GET /api/calculators/invention-planner/system-cost-index` | InventionPlannerController@systemCostIndex | auth | `GET /api/v1/systems/{systemId}/cost-indices` | done (B4); alias removed (D6) |
| `GET /api/calculators/manufacturing-browser/categories` | ManufacturingBrowserController@categories | auth | `GET /api/v1/manufacturing/categories` | done (B4); alias removed (D6) |
| `GET /api/calculators/manufacturing/blueprint-data` | ManufacturingController@blueprintData | auth | `GET /api/v1/blueprints/{blueprintTypeId}` | done (B4); alias removed (D6) |
| `GET /api/calculators/manufacturing/search` | ManufacturingController@search | auth | `GET /api/v1/blueprints?q=` | done (B4); alias removed (D6) |
| `GET /api/calculators/manufacturing/type-info` | ManufacturingController@typeInfo | auth | `GET /api/v1/types/{typeId}` | done (B4); alias removed (D6) |
| `GET /api/calculators/reaction-planner/reaction-data` | ReactionPlannerController@reactionData | auth | `GET /api/v1/reactions/formulas/{formulaTypeId}` | done (B4); alias removed (D6) |
| `GET /api/calculators/reaction-planner/search` | ReactionPlannerController@search | auth | `GET /api/v1/reactions/formulas?q=` | done (B4); alias removed (D6) |
| `GET /api/calculators/reaction-planner/search-stations` | ReactionPlannerController@searchStations | auth | `GET /api/v1/stations?q=` | done (B4); alias removed (D6) |
| `GET /api/calculators/reaction-planner/search-systems` | ReactionPlannerController@searchSystems | auth | `GET /api/v1/systems?q= / GET /api/v1/systems/{systemId}` | done (B4); alias removed (D6) |
| `GET /api/calculators/reaction-planner/system-cost-index` | ReactionPlannerController@systemCostIndex | auth | `GET /api/v1/systems/{systemId}/cost-indices` | done (B4); alias removed (D6) |
| `GET /api/calculators/reactions/reaction-data` | ReactionsController@reactionData | auth | `GET /api/v1/reactions/formulas/{formulaTypeId}` | done (B4); alias removed (D6) |
| `GET /api/calculators/reactions/search` | ReactionsController@search | auth | `GET /api/v1/reactions/formulas?q=` | done (B4); alias removed (D6) |
| `GET /api/calculators/reactions/type-info` | ReactionsController@typeInfo | auth | `GET /api/v1/types/{typeId}` | done (B4); alias removed (D6) |
| `GET /api/corporate/ess-tracker/search-systems` | EssTrackerController@searchSystems | auth | `GET /api/v1/systems?q=` | done (B4); alias removed (D6) |
| `GET /api/corporate/structure-vulnerability/search-systems` | StructureVulnerabilityController@searchSystems | auth | `GET /api/v1/systems?q=` | done (B4); alias removed (D6) |
| `GET /api/market-browser/full-tree` | MarketBrowserController@fullTree | auth | `GET /api/v1/market-groups/tree` | done (B4); alias removed (D7) |
| `GET /api/market-browser/groups/{marketGroupId}` | MarketBrowserController@groupContents | auth | `GET /api/v1/market-groups/{marketGroupId}` | done (B4); alias removed (D7) |
| `GET /api/market-browser/root-groups` | MarketBrowserController@rootGroups | auth | `GET /api/v1/market-groups` | done (B4); alias removed (D7) |
| `GET /api/market-browser/search` | MarketBrowserController@search | auth | `GET /api/v1/types?q=` | done (B4); alias removed (D7) |
| `GET /api/structures/search-systems` | MyStructuresController@searchSystems | auth | `GET /api/v1/systems?q=` | done (B4); alias removed (D6) |
| `GET /api/tools/moon-scan/corporation-search` | MoonScanController@corporationSearch | auth | `GET /api/v1/corporations?q=` | done (B4); alias removed (D6) |
| `GET /api/wholemap/search-systems` | WholemapController@searchSystems | auth | `GET /api/v1/systems?q=` | done (B4); alias removed (D6) |

### Market (3)

| Old route | Handler | Auth | v1 target | Status |
|---|---|---|---|---|
| `GET /api/market/region-arbitrage` | MarketTradingController@regionArbitrageApi | auth | `GET /api/v1/market/region-arbitrage` | done (B4); alias removed (D5) |
| `GET /api/market/station-trading` | MarketTradingController@stationTradingApi | auth | `GET /api/v1/market/station-trading` | done (B4); alias removed (D5) |
| `POST /api/tools/contract-appraisal` | ContractAppraisalController@appraise | auth | `POST /api/v1/market/appraisals` | done (B4); alias removed (D6) |

### Corp, assets and stock (6)

| Old route | Handler | Auth | v1 target | Status |
|---|---|---|---|---|
| `GET /api/assets` | AssetController@api | auth | `GET /api/v1/assets` | done (B4); alias removed (D2) |
| `GET /api/assets/corporation` | AssetController@corporationApi | auth | `GET /api/v1/corporation/assets` | done (B4); alias removed (D2) |
| `GET /api/corporate/donations` | CorporateDonationController@api | auth | `GET /api/v1/corporation/donations` | done (B4); alias removed (D6) |
| `GET /api/corporate/ess-tracker` | EssTrackerController@api | auth | `GET /api/v1/corporation/ess` | done (B4); alias removed (D6) |
| `GET /api/corporate/projects` | CorporationProjectsController@api | auth | `GET /api/v1/corporation/projects` | done (B4); alias removed (D6) |
| `GET /api/industry/stock-manager/search` | IndustryStockController@search | auth, stock-manager | `GET /api/v1/stock/search?q=` (stock-manager only) | done (B5); alias removed (D6) |

### Calculators (15)

| Old route | Handler | Auth | v1 target | Status |
|---|---|---|---|---|
| `POST /api/calculators/invention-planner/calculate` | InventionPlannerController@calculate | auth | `POST /api/v1/calculators/invention` | done (B4); alias removed (D6) |
| `GET /api/calculators/invention-planner/character-skills` | InventionPlannerController@characterSkills | auth | `GET /api/v1/calculators/invention/skills` | done (B4); alias removed (D6) |
| `GET /api/calculators/manufacturing-browser/browse` | ManufacturingBrowserController@browse | auth | `GET /api/v1/calculators/manufacturing-browser` | done (B4); alias removed (D6) |
| `POST /api/calculators/manufacturing-browser/calculate` | ManufacturingBrowserController@calculate | auth | `POST /api/v1/calculators/manufacturing-browser` | done (B4); alias removed (D6) |
| `POST /api/calculators/manufacturing/calculate` | ManufacturingController@calculate | auth | `POST /api/v1/calculators/manufacturing` | done (B4); alias removed (D6) |
| `GET /api/calculators/manufacturing/character-skills` | ManufacturingController@characterSkills | auth | `GET /api/v1/calculators/manufacturing/skills` | done (B4); alias removed (D6) |
| `POST /api/calculators/manufacturing/queue-summary` | ManufacturingController@queueSummary | auth | `POST /api/v1/calculators/manufacturing/queue-summary` | done (B4); alias removed (D6) |
| `POST /api/calculators/manufacturing/stock` | ManufacturingController@stock | auth | `POST /api/v1/calculators/manufacturing/stock` | done (B4); alias removed (D6) |
| `POST /api/calculators/reaction-browser/calculate` | ReactionBrowserController@calculate | auth | `POST /api/v1/calculators/reaction-browser` | done (B4); alias removed (D6) |
| `POST /api/calculators/reaction-planner/calculate` | ReactionPlannerController@calculate | auth | `POST /api/v1/calculators/reaction-planner` | done (B4); alias removed (D6) |
| `POST /api/calculators/reaction-planner/formula-stock` | ReactionPlannerController@formulaStock | auth | `POST /api/v1/calculators/reaction-planner/formula-stock` | done (B4); alias removed (D6) |
| `POST /api/calculators/reaction-planner/stock` | ReactionPlannerController@stock | auth | `POST /api/v1/calculators/reaction-planner/stock` | done (B4); alias removed (D6) |
| `POST /api/calculators/reactions/calculate` | ReactionsController@calculate | auth | `POST /api/v1/calculators/reactions` | done (B4); alias removed (D6) |
| `GET /api/calculators/reactions/character-skills` | ReactionsController@characterSkills | auth | `GET /api/v1/calculators/reactions/skills` | done (B4); alias removed (D6) |
| `GET /api/planetary/factory-planner/calculate` | FactoryPlanetPlannerController@calculate | auth | `GET /api/v1/calculators/factory-planner` | done (B4); alias removed (D6) |

### Heavy pages (12)

| Old route | Handler | Auth | v1 target | Status |
|---|---|---|---|---|
| `GET /api/build-programs/{program}/asset-locations` | BuildProgramController@assetLocations | auth | `GET /api/v1/build-programs/{program}/asset-locations` | done (B5); alias removed (D6) |
| `GET /api/build-programs/{program}/progress` | BuildProgramController@progress | auth | `GET /api/v1/build-programs/{program}/progress` | done (B5); alias removed (D6) |
| `GET /api/corporate/build-programs/{program}/asset-locations` | CorporationBuildProgramController@assetLocations | auth | `GET /api/v1/corporation/build-programs/{program}/asset-locations` | done (B5); alias removed (D6) |
| `GET /api/corporate/build-programs/{program}/progress` | CorporationBuildProgramController@progress | auth | `GET /api/v1/corporation/build-programs/{program}/progress` | done (B5); alias removed (D6) |
| `GET /api/industry/availability` | IndustryController@availabilityApi | auth | `GET /api/v1/industry/availability` | done (B5); alias removed (D3) |
| `GET /api/industry/reprocessing` | ReprocessingController@api | auth | `GET /api/v1/industry/reprocessing` | done (B5); alias removed (D3) |
| `GET /api/structures` | MyStructuresController@list | auth | `GET /api/v1/structures` | done (B5); alias removed (D6) |
| `POST /api/tools/moon-scan` | MoonScanController@analyse | auth | `POST /api/v1/moon-scans` | done (B5); alias removed (D6) |
| `GET /api/tools/moon-scan/system/{system}` | MoonScanController@systemResults | auth | `GET /api/v1/moon-scans/systems/{system}` | done (B5); alias removed (D6) |
| `GET /api/tools/moon-scan/systems` | MoonScanController@systems | auth | `GET /api/v1/moon-scans/systems` | done (B5); alias removed (D6) |
| `GET /api/wholemap/connections/{connection}/jump-logs` | WholemapController@getJumpLogs | auth | `GET /api/v1/wholemap/connections/{connection}/jump-logs` | done (B5); alias removed (D6) |
| `GET /api/wholemap/current-location` | WholemapController@getCurrentLocation | auth | `GET /api/v1/wholemap/location` | done (B5); alias removed (D6) |

### Write / other (49)

| Old route | Handler | Auth | v1 target | Status |
|---|---|---|---|---|
| `POST /api/build-programs` | BuildProgramController@store | auth | `POST /api/v1/build-programs` | done (B5); alias removed (D7) |
| `POST /api/build-programs/from-reaction-plan` | BuildProgramController@storeFromReactionPlan | auth | `POST /api/v1/build-programs/from-reaction-plan` | done (B5); alias removed (D7) |
| `POST /api/build-programs/merge` | BuildProgramController@merge | auth | `POST /api/v1/build-programs/merge` | done (B5); alias removed (D6) |
| `PUT /api/build-programs/{program}` | BuildProgramController@update | auth | `PUT /api/v1/build-programs/{program}` | done (B5); alias removed (D6) |
| `DELETE /api/build-programs/{program}` | BuildProgramController@destroy | auth | `DELETE /api/v1/build-programs/{program}` | done (B5); alias removed (D6) |
| `PATCH /api/build-programs/{program}/location-filter` | BuildProgramController@updateLocationFilter | auth | `PATCH /api/v1/build-programs/{program}/location-filter` | done (B5); alias removed (D6) |
| `GET /api/calculators/invention-planner/plans` | InventionPlannerController@listPlans | auth | `GET /api/v1/invention-plans` | done (B4); alias removed (D6) |
| `POST /api/calculators/invention-planner/plans` | InventionPlannerController@storePlan | auth | `POST /api/v1/invention-plans` | done (B4); alias removed (D6) |
| `GET /api/calculators/invention-planner/plans/{plan}` | InventionPlannerController@showPlan | auth | `GET /api/v1/invention-plans/{plan}` | done (B4); alias removed (D6) |
| `PUT /api/calculators/invention-planner/plans/{plan}` | InventionPlannerController@updatePlan | auth | `PUT /api/v1/invention-plans/{plan}` | done (B4); alias removed (D6) |
| `DELETE /api/calculators/invention-planner/plans/{plan}` | InventionPlannerController@destroyPlan | auth | `DELETE /api/v1/invention-plans/{plan}` | done (B4); alias removed (D6) |
| `GET /api/calculators/manufacturing/station-configs` | ManufacturingController@stationConfigs | auth | `GET /api/v1/station-configs` | done (B5); alias removed (D7) |
| `POST /api/calculators/manufacturing/station-configs` | ManufacturingController@storeStationConfig | auth | `POST /api/v1/station-configs` | done (B5); alias removed (D7) |
| `PUT /api/calculators/manufacturing/station-configs/{stationConfig}` | ManufacturingController@updateStationConfig | auth | `PUT /api/v1/station-configs/{stationConfig}` | done (B5); alias removed (D7) |
| `DELETE /api/calculators/manufacturing/station-configs/{stationConfig}` | ManufacturingController@destroyStationConfig | auth | `DELETE /api/v1/station-configs/{stationConfig}` | done (B5); alias removed (D7) |
| `POST /api/calculators/manufacturing/station-configs/{stationConfig}/set-default` | ManufacturingController@setDefaultStationConfig | auth | `POST /api/v1/station-configs/{stationConfig}/default` | done (B5); alias removed (D7) |
| `GET /api/calculators/reaction-planner/plans` | ReactionPlannerController@listPlans | auth | `GET /api/v1/reaction-plans` | done (B4); alias removed (D6) |
| `POST /api/calculators/reaction-planner/plans` | ReactionPlannerController@storePlan | auth | `POST /api/v1/reaction-plans` | done (B4); alias removed (D6) |
| `GET /api/calculators/reaction-planner/plans/{plan}` | ReactionPlannerController@showPlan | auth | `GET /api/v1/reaction-plans/{plan}` | done (B4); alias removed (D6) |
| `PUT /api/calculators/reaction-planner/plans/{plan}` | ReactionPlannerController@updatePlan | auth | `PUT /api/v1/reaction-plans/{plan}` | done (B4); alias removed (D6) |
| `DELETE /api/calculators/reaction-planner/plans/{plan}` | ReactionPlannerController@destroyPlan | auth | `DELETE /api/v1/reaction-plans/{plan}` | done (B4); alias removed (D6) |
| `POST /api/corporate/build-programs` | CorporationBuildProgramController@store | auth | `POST /api/v1/corporation/build-programs` | done (B5); alias removed (D7) |
| `POST /api/corporate/build-programs/from-reaction-plan` | CorporationBuildProgramController@storeFromReactionPlan | auth | `POST /api/v1/corporation/build-programs/from-reaction-plan` | done (B5); alias removed (D7) |
| `POST /api/corporate/build-programs/merge` | CorporationBuildProgramController@merge | auth | `POST /api/v1/corporation/build-programs/merge` | done (B5); alias removed (D6) |
| `PUT /api/corporate/build-programs/{program}` | CorporationBuildProgramController@update | auth | `PUT /api/v1/corporation/build-programs/{program}` | done (B5); alias removed (D6) |
| `DELETE /api/corporate/build-programs/{program}` | CorporationBuildProgramController@destroy | auth | `DELETE /api/v1/corporation/build-programs/{program}` | done (B5); alias removed (D6) |
| `PATCH /api/corporate/build-programs/{program}/location-filter` | CorporationBuildProgramController@updateLocationFilter | auth | `PATCH /api/v1/corporation/build-programs/{program}/location-filter` | done (B5); alias removed (D6) |
| `POST /api/industry/availability/clear` | IndustryController@clearCaches | auth | `POST /api/v1/industry/availability/clear` | done (B5); alias removed (D3) |
| `POST /api/industry/availability/refresh` | IndustryController@refresh | auth | `POST /api/v1/industry/availability/refresh` | done (B5); alias removed (D3) |
| `POST /api/industry/can-produce/refresh` | CanProduceController@refresh | auth | `POST /api/v1/industry/can-produce/refresh` | done (B5); alias removed (D6) |
| `POST /api/industry/stock-manager/items` | IndustryStockController@storeItem | auth, stock-manager | `POST /api/v1/stock/items` | done (B5); alias removed (D6) |
| `PUT /api/industry/stock-manager/items/{item}` | IndustryStockController@updateItem | auth, stock-manager | `PUT /api/v1/stock/items/{item}` | done (B5); alias removed (D6) |
| `DELETE /api/industry/stock-manager/items/{item}` | IndustryStockController@destroyItem | auth, stock-manager | `DELETE /api/v1/stock/items/{item}` | done (B5); alias removed (D6) |
| `POST /api/structures` | MyStructuresController@store | auth | `POST /api/v1/structures` | done (B5); alias removed (D6) |
| `PUT /api/structures/{structure}` | MyStructuresController@update | auth | `PUT /api/v1/structures/{structure}` | done (B5); alias removed (D6) |
| `DELETE /api/structures/{structure}` | MyStructuresController@destroy | auth | `DELETE /api/v1/structures/{structure}` | done (B5); alias removed (D6) |
| `POST /api/structures/{structure}/set-default` | MyStructuresController@setDefault | auth | `POST /api/v1/structures/{structure}/default` | done (B5); alias removed (D6) |
| `POST /api/tools/moon-scan/moon/{moonId}/occupation` | MoonScanController@updateMoonOccupation | auth | `PUT /api/v1/moon-scans/moons/{moonId}/occupation` | done (B5); alias removed (D6) |
| `POST /api/wholemap/connections` | WholemapController@storeConnection | auth | `POST /api/v1/wholemap/connections` | done (B5); alias removed (D6) |
| `PUT /api/wholemap/connections/{connection}` | WholemapController@updateConnection | auth | `PUT /api/v1/wholemap/connections/{connection}` | done (B5); alias removed (D6) |
| `DELETE /api/wholemap/connections/{connection}` | WholemapController@destroyConnection | auth | `DELETE /api/v1/wholemap/connections/{connection}` | done (B5); alias removed (D6) |
| `POST /api/wholemap/jump-logs` | WholemapController@storeJumpLog | auth | `POST /api/v1/wholemap/jump-logs` | done (B5); alias removed (D6) |
| `POST /api/wholemap/notes` | WholemapController@storeOrUpdateNote | auth | `PUT /api/v1/wholemap/notes` | done (B5); alias removed (D6) |
| `DELETE /api/wholemap/notes/{note}` | WholemapController@destroyNote | auth | `DELETE /api/v1/wholemap/notes/{note}` | done (B5); alias removed (D6) |
| `POST /api/wholemap/signatures` | WholemapController@storeSignature | auth | `POST /api/v1/wholemap/signatures` | done (B5); alias removed (D6) |
| `POST /api/wholemap/signatures/paste` | WholemapController@pasteSignatures | auth | `POST /api/v1/wholemap/signatures/paste` | done (B5); alias removed (D6) |
| `PUT /api/wholemap/signatures/{signature}` | WholemapController@updateSignature | auth | `PUT /api/v1/wholemap/signatures/{signature}` | done (B5); alias removed (D6) |
| `DELETE /api/wholemap/signatures/{signature}` | WholemapController@destroySignature | auth | `DELETE /api/v1/wholemap/signatures/{signature}` | done (B5); alias removed (D6) |
| `POST /api/wholemap/signatures/{signature}/toggle-lock` | WholemapController@toggleLockSignature | auth | `POST /api/v1/wholemap/signatures/{signature}/lock-toggle` | done (B5); alias removed (D6) |

## D6: admin area

The admin pages were Blade routes under `/admin`, not `/api/...` aliases, so
none of them is in the 111 above. They moved to `/api/v1/admin/*` (all
`auth:sanctum` + `admin`; guest 401, non-admin 403) when the React pages
shipped. Each old web route is gone; the `GET` pages redirect to `/app/admin/...`
and keep their names. alias removed (D6) means the old URL no longer serves
anything but the redirect.

| Old route | v1 | Status |
|---|---|---|
| `GET /admin/dashboard` | `GET /api/v1/admin/dashboard` | alias removed (D6) |
| `GET /admin/users` | `GET /api/v1/admin/users` | alias removed (D6) |
| `POST /admin/users/{user}/toggle-status` | `POST /api/v1/admin/users/{user}/toggle-status` | alias removed (D6) |
| `POST /admin/users/{user}/toggle-admin` | `POST /api/v1/admin/users/{user}/toggle-admin` | alias removed (D6) |
| `POST /admin/users/{user}/toggle-stock-manager` | `POST /api/v1/admin/users/{user}/toggle-stock-manager` | alias removed (D6) |
| `DELETE /admin/users/{user}` | `DELETE /api/v1/admin/users/{user}` | alias removed (D6) |
| `GET /admin/users/{user}/industry-jobs` | `GET /api/v1/admin/users/{user}/industry-jobs` | alias removed (D6) |
| `GET /admin/sponsors`, `/create`, `/{sponsor}/edit` | `GET /api/v1/admin/sponsors`, `GET /api/v1/admin/sponsors/{sponsor}` | alias removed (D6) |
| `POST /admin/sponsors` | `POST /api/v1/admin/sponsors` | alias removed (D6) |
| `PUT /admin/sponsors/{sponsor}` | `POST /api/v1/admin/sponsors/{sponsor}` (multipart) | alias removed (D6) |
| `DELETE /admin/sponsors/{sponsor}` | `DELETE /api/v1/admin/sponsors/{sponsor}` | alias removed (D6) |
| `GET`/`PUT /admin/settings` | `GET`/`PUT /api/v1/admin/account` | alias removed (D6) |
| `GET`/`PUT /admin/discord-bot` | `GET`/`PUT /api/v1/admin/discord-bot` | alias removed (D6) |

Still web-only: `GET`/`POST /admin/login` (the admin sign-in form).

## D7: application cutover

All legacy /api aliases in the table above have retired. The final slice removes the market-tree, station-config and build-program create aliases. Linked-character main/remove actions, and account deletion now have session-authenticated v1 endpoints. The public landing page moves to /welcome and / redirects to /app/dashboard.
