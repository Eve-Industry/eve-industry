<?php

namespace App\Services\Fittings;

use App\Models\CorporationBuildProgramConfig;
use App\Models\CorporationFitting;
use App\Models\EveType;
use App\Models\InvGroup;
use App\Models\User;
use App\Services\AssetService;
use App\Services\CorporationBuildProgramService;
use App\Services\EsiService;
use App\Services\Heavy\AssetLocationResolver;
use App\Services\Heavy\HeavyServiceException;
use Illuminate\Validation\ValidationException;

/**
 * The corporate fitting program: how many of the corporation's fittings can
 * be fitted from the corporation's assets and blueprints, read with the
 * enabling director's token like the corporate build program progress. The
 * user's personal assets are never counted.
 */
class CorporationFittingProgramService
{
    public function __construct(
        private FittingPlanner $planner,
        private EsiService $esi,
        private CorporationBuildProgramService $programs,
        private AssetLocationResolver $locations,
    ) {}

    /**
     * The active config that gives the user access to corporate fittings.
     *
     * @throws HeavyServiceException 404 when the feature is off for the user's
     *                               corporation, 403 without a character there
     */
    public function configFor(User $user): CorporationBuildProgramConfig
    {
        $config = $this->programs->getConfigForUser((int) $user->id);
        if (! $config) {
            throw new HeavyServiceException(404, 'Corporate build programs not enabled');
        }
        if (! $this->programs->canUserView($user, $config->corporation_id)) {
            throw new HeavyServiceException(403, 'Access denied');
        }

        return $config;
    }

    /**
     * @param  list<array{fitting_id: int, ships: int}>  $selections
     * @param  list<int>  $locationIds  root station/structure ids; empty counts all stock
     * @param  bool  $countFitted  ships already fitted to a fitting count toward its ships     * @return array{plan: array<string, mixed>, character_name: string}
     *
     * @throws HeavyServiceException 400 when the director character is gone
     * @throws ValidationException when a selection is not one of the corporation's fittings
     */
    public function plan(CorporationBuildProgramConfig $config, array $selections, array $locationIds = [], bool $includeHull = true, bool $countFitted = true): array
    {
        $director = $config->character;
        if (! $director) {
            throw new HeavyServiceException(400, 'Director character no longer available');
        }

        $resolved = $this->resolveSelections($config->corporation_id, $selections);

        $assets = $this->esi->getCorporationAssets($director, $config->corporation_id);
        $assetMap = $this->locations->assetMap($assets);

        $hullIds = array_flip(array_map(fn ($s) => (int) $s['fitting']->ship_type_id, $resolved));
        $shipTypeIds = array_flip(
            EveType::whereIn('group_id', InvGroup::select('group_id')->where('category_id', AssetService::SHIP_CATEGORY_ID))
                ->pluck('type_id')->all()
        );
        $onHand = [];
        $fittedTo = [];
        $inside = [];
        $shipAssets = [];
        foreach ($assets as $asset) {
            $typeId = $asset['type_id'] ?? 0;
            $quantity = $asset['quantity'] ?? 0;
            if (! $typeId || $quantity <= 0) {
                continue;
            }
            $rootId = $this->locations->rootLocationId($asset, $assetMap);
            $inScope = $locationIds === [] || in_array($rootId, $locationIds, true);

            // What sits directly inside another item; the ships' share is used below.
            if (($asset['location_type'] ?? '') === 'item') {
                $inside[(int) $asset['location_id']][] = ['type_id' => (int) $typeId, 'quantity' => (int) $quantity, 'flag' => (string) ($asset['location_flag'] ?? '')];
            }

            if (isset($hullIds[$typeId]) && $inScope) {
                $shipAssets[] = [$asset, $rootId];
            }
            // Modules fitted to a ship are not stock; remember them for the ship.
            if (in_array($asset['location_flag'] ?? null, FittedSlots::FLAGS, true)) {
                $shipId = (int) ($asset['location_id'] ?? 0);
                $fittedTo[$shipId][$typeId] = ($fittedTo[$shipId][$typeId] ?? 0) + $quantity;

                continue;
            }
            // Neither is anything else inside a ship (cargo, drone bay, containers in them).
            if ($this->isInsideShip($asset, $assetMap, $shipTypeIds)) {
                continue;
            }
            if ($inScope) {
                $onHand[$typeId] = ($onHand[$typeId] ?? 0) + $quantity;
            }
        }

        $roots = array_unique(array_column($shipAssets, 1));
        $names = [];
        foreach ($roots === [] ? [] : $this->locations->describe($roots, []) as $location) {
            $names[$location['location_id']] = $location['name'];
        }

        // Corporation assets carry type ids only; name what is inside the ships.
        $contentTypeIds = [];
        foreach ($shipAssets as [$asset]) {
            foreach ($inside[(int) $asset['item_id']] ?? [] as $line) {
                $contentTypeIds[$line['type_id']] = true;
            }
        }
        $typeNames = $contentTypeIds === [] ? collect() : EveType::whereIn('type_id', array_keys($contentTypeIds))->pluck('name', 'type_id');

        $ships = array_map(fn ($pair) => [
            'item_id' => (int) $pair[0]['item_id'],
            'type_id' => (int) $pair[0]['type_id'],
            'name' => null,
            'location_id' => $pair[1] ?: null,
            'location_name' => $names[$pair[1]] ?? null,
            'fitted' => $fittedTo[(int) $pair[0]['item_id']] ?? [],
            'contents' => array_map(fn ($line) => [
                'type_id' => $line['type_id'],
                'name' => (string) ($typeNames[$line['type_id']] ?? "Type {$line['type_id']}"),
                'quantity' => $line['quantity'],
                'flag' => $line['flag'],
            ], $inside[(int) $pair[0]['item_id']] ?? []),
        ], $shipAssets);

        $owned = array_values(array_unique(array_map(
            fn ($bp) => (int) $bp['type_id'],
            $this->esi->getCorporationBlueprints($director, $config->corporation_id)
        )));

        return [
            'plan' => $this->planner->plan($resolved, $onHand, $owned, $includeHull, $ships, $countFitted),
            'character_name' => $director->name,
        ];
    }

    /**
     * Whether the asset sits somewhere below a ship: directly in it, or in a
     * container (or deeper) inside it.
     *
     * @param  array<string, mixed>  $asset
     * @param  array<int, array<string, mixed>>  $assetMap  item_id => asset
     * @param  array<int, int>  $shipTypeIds  ship type ids as keys
     */
    private function isInsideShip(array $asset, array $assetMap, array $shipTypeIds): bool
    {
        // Bounded, so a malformed parent loop cannot spin.
        for ($depth = 0; $depth < 20 && ($asset['location_type'] ?? '') === 'item'; $depth++) {
            $asset = $assetMap[(int) ($asset['location_id'] ?? 0)] ?? null;
            if ($asset === null) {
                return false;
            }
            if (isset($shipTypeIds[(int) ($asset['type_id'] ?? 0)])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Steps for the shortfall, ready for CorporationBuildProgramWriter::create.
     *
     * @param  array<string, mixed>  $plan  the `plan` of plan()
     * @param  list<int>|null  $typeIds
     * @return list<array<string, mixed>>
     */
    public function buildSteps(array $plan, ?array $typeIds, int $meLevel): array
    {
        return $this->planner->buildSteps($plan['items'], $typeIds, $meLevel);
    }

    /**
     * @param  list<array{fitting_id: int, ships: int}>  $selections
     * @return list<array{fitting: CorporationFitting, ships: int}>
     */
    private function resolveSelections(int $corporationId, array $selections): array
    {
        $fittings = CorporationFitting::where('corporation_id', $corporationId)
            ->whereIn('id', array_column($selections, 'fitting_id'))
            ->get()->keyBy('id');

        $resolved = [];
        foreach ($selections as $index => $selection) {
            $fitting = $fittings->get($selection['fitting_id']);
            if (! $fitting) {
                throw ValidationException::withMessages(["selections.{$index}.fitting_id" => 'Fitting not found.']);
            }
            $resolved[] = ['fitting' => $fitting, 'ships' => (int) $selection['ships']];
        }

        return $resolved;
    }
}
