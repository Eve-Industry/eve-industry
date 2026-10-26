<?php

namespace App\Services\Fittings;

use App\Models\CorporationBuildProgramConfig;
use App\Models\CorporationFitting;
use App\Models\User;
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
     * @return array{plan: array<string, mixed>, character_name: string}
     *
     * @throws HeavyServiceException 400 when the director character is gone
     * @throws ValidationException when a selection is not one of the corporation's fittings
     */
    public function plan(CorporationBuildProgramConfig $config, array $selections, array $locationIds = [], bool $includeHull = true): array
    {
        $director = $config->character;
        if (! $director) {
            throw new HeavyServiceException(400, 'Director character no longer available');
        }

        $resolved = $this->resolveSelections($config->corporation_id, $selections);

        $assets = $this->esi->getCorporationAssets($director, $config->corporation_id);
        $assetMap = $this->locations->assetMap($assets);

        $onHand = [];
        foreach ($assets as $asset) {
            $typeId = $asset['type_id'] ?? 0;
            $quantity = $asset['quantity'] ?? 0;
            if (! $typeId || $quantity <= 0) {
                continue;
            }
            // Modules fitted to a ship are not stock.
            if (in_array($asset['location_flag'] ?? null, FittedSlots::FLAGS, true)) {
                continue;
            }
            if ($locationIds !== [] && ! in_array($this->locations->rootLocationId($asset, $assetMap), $locationIds, true)) {
                continue;
            }
            $onHand[$typeId] = ($onHand[$typeId] ?? 0) + $quantity;
        }

        $owned = array_values(array_unique(array_map(
            fn ($bp) => (int) $bp['type_id'],
            $this->esi->getCorporationBlueprints($director, $config->corporation_id)
        )));

        return [
            'plan' => $this->planner->plan($resolved, $onHand, $owned, $includeHull),
            'character_name' => $director->name,
        ];
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
