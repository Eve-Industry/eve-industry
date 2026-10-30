<?php

namespace App\Services\Fittings;

use App\Models\Fitting;
use App\Models\User;
use App\Services\AssetService;
use App\Services\BlueprintResearchService;
use Illuminate\Validation\ValidationException;

/**
 * The personal fitting program: how many of the user's fittings they can fit
 * from their own characters' assets and blueprints. Corporation assets are
 * never counted; see CorporationFittingProgramService for those.
 */
class FittingProgramService
{
    public function __construct(
        private FittingPlanner $planner,
        private AssetService $assets,
        private BlueprintResearchService $blueprints,
    ) {}

    /**
     * @param  list<array{fitting_id: int, ships: int}>  $selections
     * @param  list<int>  $locationIds  root station/structure ids; empty counts all stock
     * @param  bool  $countFitted  ships already fitted to a fitting count toward its ships     * @return array{plan: array<string, mixed>, assets: array<string, mixed>}
     *
     * @throws ValidationException when a selection is not one of the user's fittings
     */
    public function plan(User $user, array $selections, array $locationIds = [], bool $includeHull = true, bool $countFitted = true): array
    {
        $resolved = $this->resolveSelections($user, $selections);

        $typeIds = [];
        $hullIds = [];
        foreach ($resolved as $selection) {
            $hullIds[] = (int) $selection['fitting']->ship_type_id;
            $typeIds[] = (int) $selection['fitting']->ship_type_id;
            foreach ($selection['fitting']->items as $item) {
                $typeIds[] = (int) $item['type_id'];
            }
        }

        [$onHand, $assetMeta] = $this->assets->personalTypeQuantities($user->id, array_values(array_unique($typeIds)), $locationIds);
        $ships = $this->assets->personalAssembledShips($user->id, array_values(array_unique($hullIds)), $locationIds);
        $owned = array_keys($this->blueprints->getOwnedBlueprints($user));

        return [
            'plan' => $this->planner->plan($resolved, $onHand, $owned, $includeHull, $ships, $countFitted),
            'assets' => $assetMeta,
        ];
    }

    /**
     * Steps for the shortfall, ready for BuildProgramWriter::create.
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
     * @return list<array{fitting: Fitting, ships: int}>
     */
    private function resolveSelections(User $user, array $selections): array
    {
        $fittings = $user->fittings()->whereIn('id', array_column($selections, 'fitting_id'))->get()->keyBy('id');

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
