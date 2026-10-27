<?php

namespace App\Http\Resources\V1\Fittings;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What it takes to fit the chosen ships: per fitting, the ships you already
 * have (fitted or partly fitted) and what is still needed, and per item the
 * quantity required, held and missing. Built by FittingPlanner.
 *
 * @property array<string, mixed> $resource
 */
class FittingPlanResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            /**
             * One row per selected fitting. `ships_fitted` of the wanted `ships` are already
             * fitted ships you own (counted); `ships_fittable` also includes the ships your
             * stock could fit. `existing_ships` lists your fitted and partly fitted ships of the
             * fitting's hull: `status` is `fitted` or `partial`, `counted` says whether a fitted
             * ship counts toward `ships`, and `missing` is what a partly fitted ship still lacks.
             * `contents` is everything directly inside a ship, each with its ESI `flag` (slots
             * such as `HiSlot0`, `Cargo`, `DroneBay`, other holds); items inside containers
             * are not listed.
             *
             * @var list<array{fitting_id: int, name: string, ship_type_id: int, ship_type_name: string, ships: int, ships_fitted: int, ships_fittable: int, existing_ships: list<array{item_id: int, name: string|null, location_id: int|null, location_name: string|null, status: string, fitted_count: int, total_count: int, counted: bool, missing: list<array{type_id: int, name: string, quantity: int}>, contents: list<array{type_id: int, name: string, quantity: int, flag: string}>}>}>
             */
            'fittings' => $this->resource['fittings'],
            /**
             * Every item still needed after counting fitted ships. `kind` is `hull`, `fitted`
             * (slot items) or `cargo` (loose items and drones).
             *
             * @var list<array{type_id: int, name: string, kind: string, required: int, on_hand: int, missing: int, buildable: bool, blueprint_type_id: int|null, blueprint_owned: bool}>
             */
            'items' => $this->resource['items'],
            /** @var array{item_types: int, missing_types: int, complete: bool} */
            'summary' => $this->resource['summary'],
        ];
    }
}
