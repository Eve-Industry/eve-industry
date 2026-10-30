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
    public function __construct(
        private InventionPlannerService $inventionPlanner,
        private ShipFitChecker $checker,
    ) {}

    /**
     * Ships you already own count toward the request: a ship of the fitting's
     * hull that has every slot item fitted is one ship done, so only the rest
     * need hulls and slot items. Loose items (cargo, drones) are still needed
     * for every ship. Partly fitted ships are listed but not counted.
     *
     * `$assembledShips` are the owner's assembled ships with what is fitted to
     * each (type_id => quantity): item_id, type_id, name, location_id,
     * location_name and fitted.
     *
     * @param  list<array{fitting: object, ships: int}>  $selections  fitting is a Fitting or CorporationFitting
     * @param  array<int, int>  $onHand  type_id => quantity held, items fitted to ships left out
     * @param  list<int>  $ownedBlueprintTypeIds  blueprint type ids the owner holds (originals or copies)
     * @param  list<array<string, mixed>>  $assembledShips
     * @param  bool  $countFitted  count fully fitted ships toward the request
     * @return array{
     *     fittings: list<array<string, mixed>>,
     *     items: list<array<string, mixed>>,
     *     summary: array{item_types: int, missing_types: int, complete: bool}
     * }
     */
    public function plan(array $selections, array $onHand, array $ownedBlueprintTypeIds, bool $includeHull = true, array $assembledShips = [], bool $countFitted = true): array
    {
        $required = [];
        $meta = [];
        $fittings = [];
        $claimed = [];

        foreach ($selections as $selection) {
            $fitting = $selection['fitting'];
            $ships = $selection['ships'];
            $lines = $this->perShipRequirements($fitting);

            $existing = $this->existingShips($fitting, $lines, $assembledShips, $claimed, $ships, $countFitted);
            $done = count(array_filter($existing, fn ($s) => $s['counted']));
            $remaining = $ships - $done;

            // A ship that is already fitted is not a hull to fit again.
            if ($includeHull && $done > 0) {
                $hullId = (int) $fitting->ship_type_id;
                $onHand[$hullId] = max(0, ($onHand[$hullId] ?? 0) - $done);
            }

            $more = null;
            foreach ($lines as $typeId => $line) {
                $hull = $includeHull ? $line['hull'] : 0;
                $perShip = $hull + $line['fitted'] + $line['cargo'];
                if ($perShip === 0) {
                    continue;
                }

                $required[$typeId] = ($required[$typeId] ?? 0) + ($hull + $line['fitted']) * $remaining + $line['cargo'] * $ships;
                $meta[$typeId] ??= ['name' => $line['name'], 'kind' => $line['fitted'] > 0 ? 'fitted' : 'cargo'];
                if ($hull > 0) {
                    $meta[$typeId]['kind'] = 'hull';
                }

                // Ships beyond the finished ones that stock could still fit.
                $canFit = intdiv(max(0, ($onHand[$typeId] ?? 0) - $line['cargo'] * $done), $perShip);
                $more = $more === null ? $canFit : min($more, $canFit);
            }

            $fittings[] = [
                'fitting_id' => (int) $fitting->id,
                'name' => (string) $fitting->name,
                'ship_type_id' => (int) $fitting->ship_type_id,
                'ship_type_name' => (string) $fitting->ship_type_name,
                'ships' => $ships,
                // Ships already fitted that count toward the request.
                'ships_fitted' => $done,
                // Ships that are done or could be fitted from stock, ignoring other selections.
                'ships_fittable' => $done + min($remaining, (int) $more),
                'existing_ships' => $existing,
            ];
        }

        $blueprints = array_flip($ownedBlueprintTypeIds);
        $items = [];
        foreach ($required as $typeId => $needed) {
            if ($needed === 0) {
                continue;
            }
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
     * The owner's assembled ships of this fitting's hull that are fitted or
     * partly fitted to it, fully fitted ones first. Up to `$ships` unclaimed
     * fully fitted ships are marked `counted` and claimed, so a second
     * selection of the same hull does not count them again.
     *
     * @param  array<int, array{name: string, hull: int, fitted: int, cargo: int}>  $lines
     * @param  list<array<string, mixed>>  $assembledShips
     * @param  array<int, true>  $claimed  item ids already counted, updated here
     * @return list<array<string, mixed>>
     */
    private function existingShips(object $fitting, array $lines, array $assembledShips, array &$claimed, int $ships, bool $countFitted): array
    {
        $slotLines = [];
        foreach ($lines as $typeId => $line) {
            if ($line['fitted'] > 0) {
                $slotLines[$typeId] = ['name' => $line['name'], 'quantity' => $line['fitted']];
            }
        }

        $found = [];
        foreach ($assembledShips as $ship) {
            if ((int) $ship['type_id'] !== (int) $fitting->ship_type_id || isset($claimed[$ship['item_id']])) {
                continue;
            }
            $result = $this->checker->check($slotLines, $ship['fitted']);
            if ($result['status'] === ShipFitChecker::NONE) {
                continue;
            }
            $found[] = [
                'item_id' => (int) $ship['item_id'],
                'name' => $ship['name'],
                'location_id' => $ship['location_id'],
                'location_name' => $ship['location_name'],
                'status' => $result['status'],
                'fitted_count' => $result['fitted_count'],
                'total_count' => $result['total_count'],
                'counted' => false,
                'missing' => $result['missing'],
                'contents' => $this->sortedContents($ship['contents'] ?? []),
            ];
        }

        // Fully fitted ships first, then the closest to done.
        $rank = fn (array $s) => [$s['status'] === ShipFitChecker::FITTED ? 0 : 1, -$s['fitted_count']];
        usort($found, fn ($a, $b) => $rank($a) <=> $rank($b));

        $counted = 0;
        foreach ($found as &$ship) {
            if ($countFitted && $ship['status'] === ShipFitChecker::FITTED && $counted < $ships) {
                $ship['counted'] = true;
                $claimed[$ship['item_id']] = true;
                $counted++;
            }
        }
        unset($ship);

        return $found;
    }

    /**
     * A ship's contents by location flag (slots first, in slot order), then name.
     *
     * @param  list<array{type_id: int, name: string, quantity: int, flag: string}>  $contents
     * @return list<array{type_id: int, name: string, quantity: int, flag: string}>
     */
    private function sortedContents(array $contents): array
    {
        $slotOrder = array_flip(FittedSlots::FLAGS);
        usort($contents, fn ($a, $b) => [$slotOrder[$a['flag']] ?? PHP_INT_MAX, $a['flag'], $a['name']]
            <=> [$slotOrder[$b['flag']] ?? PHP_INT_MAX, $b['flag'], $b['name']]);

        return $contents;
    }

    /**
     * What one ship of the fitting needs of each type: the hull, items fitted
     * to its slots, and loose cargo and drones.
     *
     * @return array<int, array{name: string, hull: int, fitted: int, cargo: int}>
     */
    private function perShipRequirements(object $fitting): array
    {
        $lines = [];
        $add = function (int $typeId, string $name, string $part, int $quantity) use (&$lines) {
            $lines[$typeId] ??= ['name' => $name, 'hull' => 0, 'fitted' => 0, 'cargo' => 0];
            $lines[$typeId][$part] += max(1, $quantity);
        };

        $add((int) $fitting->ship_type_id, (string) $fitting->ship_type_name, 'hull', 1);
        foreach ($fitting->items ?? [] as $item) {
            $part = ($item['section'] ?? 'fitted') === 'fitted' ? 'fitted' : 'cargo';
            $add((int) $item['type_id'], (string) $item['name'], $part, (int) $item['quantity']);
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
