<?php

namespace App\Services\Fittings;

use App\Models\BlueprintActivity;
use App\Services\InventionPlannerService;

/**
 * Works out what it takes to fit N ships of each selected fitting, given the
 * stock on hand. Shared by the personal and corporate fitting programs, which
 * differ only in where the stock and blueprints come from.
 */
class FittingPlanner
{
    public function __construct(private InventionPlannerService $inventionPlanner) {}

    /**
     * @param  list<array{fitting: object, ships: int}>  $selections  fitting is a Fitting or CorporationFitting
     * @param  array<int, int>  $onHand  type_id => quantity held
     * @param  list<int>  $ownedBlueprintTypeIds  blueprint type ids the owner holds (originals or copies)
     * @return array{
     *     fittings: list<array<string, mixed>>,
     *     items: list<array<string, mixed>>,
     *     summary: array{item_types: int, missing_types: int, complete: bool}
     * }
     */
    public function plan(array $selections, array $onHand, array $ownedBlueprintTypeIds, bool $includeHull = true): array
    {
        $required = [];
        $meta = [];
        $fittings = [];

        foreach ($selections as $selection) {
            $fitting = $selection['fitting'];
            $ships = $selection['ships'];
            $perShip = $this->perShipRequirements($fitting, $includeHull);

            $fittable = null;
            foreach ($perShip as $typeId => $line) {
                $required[$typeId] = ($required[$typeId] ?? 0) + $line['quantity'] * $ships;
                $meta[$typeId] ??= ['name' => $line['name'], 'kind' => $line['kind']];
                if ($line['kind'] === 'hull') {
                    $meta[$typeId]['kind'] = 'hull';
                }
                $canFit = intdiv($onHand[$typeId] ?? 0, $line['quantity']);
                $fittable = $fittable === null ? $canFit : min($fittable, $canFit);
            }

            $fittings[] = [
                'fitting_id' => (int) $fitting->id,
                'name' => (string) $fitting->name,
                'ship_type_id' => (int) $fitting->ship_type_id,
                'ship_type_name' => (string) $fitting->ship_type_name,
                'ships' => $ships,
                // Ships that could be fully fitted from stock, ignoring other selections.
                'ships_fittable' => min($ships, (int) $fittable),
            ];
        }

        $blueprints = array_flip($ownedBlueprintTypeIds);
        $items = [];
        foreach ($required as $typeId => $needed) {
            $held = $onHand[$typeId] ?? 0;
            $missing = max(0, $needed - $held);
            $producer = $missing > 0 ? $this->manufacturingBlueprint($typeId) : null;

            $items[] = [
                'type_id' => $typeId,
                'name' => $meta[$typeId]['name'],
                'kind' => $meta[$typeId]['kind'],
                'required' => $needed,
                'on_hand' => $held,
                'missing' => $missing,
                'buildable' => $producer !== null,
                'blueprint_type_id' => $producer['blueprint_type_id'] ?? null,
                'blueprint_owned' => $producer !== null && isset($blueprints[$producer['blueprint_type_id']]),
            ];
        }

        // Shortfalls first, then the hull, then by name.
        $sortKey = fn (array $i) => [$i['missing'] > 0 ? 0 : 1, $i['kind'] === 'hull' ? 0 : 1, $i['name']];
        usort($items, fn ($a, $b) => $sortKey($a) <=> $sortKey($b));

        $missingTypes = count(array_filter($items, fn ($i) => $i['missing'] > 0));

        return [
            'fittings' => $fittings,
            'items' => $items,
            'summary' => [
                'item_types' => count($items),
                'missing_types' => $missingTypes,
                'complete' => $missingTypes === 0,
            ],
        ];
    }

    /**
     * Top-level build steps for the chosen missing items, in the shape the
     * build program writers take: each step carries the ME-adjusted materials
     * for the missing quantity, which the writer expands into its sub-builds.
     *
     * @param  list<array<string, mixed>>  $planItems  the `items` of plan()
     * @param  list<int>|null  $typeIds  only these types; null means every missing buildable item
     * @return list<array<string, mixed>>
     */
    public function buildSteps(array $planItems, ?array $typeIds, int $meLevel = 10): array
    {
        $materials = [];
        foreach ($planItems as $item) {
            if ($item['missing'] <= 0 || ! $item['buildable']) {
                continue;
            }
            if ($typeIds !== null && ! in_array($item['type_id'], $typeIds, true)) {
                continue;
            }
            $materials[] = [
                'type_id' => $item['type_id'],
                'name' => $item['name'],
                'adjusted_quantity' => $item['missing'],
            ];
        }

        return $materials === [] ? [] : $this->inventionPlanner->resolveFullMaterialChain($materials, $meLevel);
    }

    /**
     * Quantity of each type one ship of the fitting needs.
     *
     * @return array<int, array{name: string, quantity: int, kind: string}>
     */
    private function perShipRequirements(object $fitting, bool $includeHull): array
    {
        $lines = [];
        if ($includeHull) {
            $lines[(int) $fitting->ship_type_id] = ['name' => (string) $fitting->ship_type_name, 'quantity' => 1, 'kind' => 'hull'];
        }

        foreach ($fitting->items ?? [] as $item) {
            $typeId = (int) $item['type_id'];
            if (isset($lines[$typeId])) {
                $lines[$typeId]['quantity'] += (int) $item['quantity'];

                continue;
            }
            $lines[$typeId] = [
                'name' => (string) $item['name'],
                'quantity' => max(1, (int) $item['quantity']),
                'kind' => (string) ($item['section'] ?? 'fitted'),
            ];
        }

        return $lines;
    }

    /**
     * @return array{blueprint_type_id: int}|null
     */
    private function manufacturingBlueprint(int $typeId): ?array
    {
        $activity = BlueprintActivity::where('activity_id', BlueprintActivity::ACTIVITY_MANUFACTURING)
            ->whereProducesType($typeId)
            ->first();

        return $activity ? ['blueprint_type_id' => (int) $activity->blueprint_type_id] : null;
    }
}
