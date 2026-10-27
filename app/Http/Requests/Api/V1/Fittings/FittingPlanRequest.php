<?php

namespace App\Http\Requests\Api\V1\Fittings;

use App\Http\Requests\Api\V1\ApiRequest;

/**
 * Which fittings, and how many ships of each, a fitting program plans for.
 * Used for personal and corporate fittings alike.
 */
class FittingPlanRequest extends ApiRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'selections' => 'required|array|min:1|max:20',
            'selections.*.fitting_id' => 'required|integer|distinct',
            /** Ships wanted of this fitting. */
            'selections.*.ships' => 'required|integer|min:1|max:10000',
            /** Count the hull as a required item (default true). */
            'include_hull' => 'boolean',
            /** Count ships you already have fully fitted toward the request (default true). */
            'count_fitted_ships' => 'boolean',            /** Only count stock at these stations/structures (root location ids). */
            'location_ids' => 'nullable|array|max:200',
            'location_ids.*' => 'integer',
        ];
    }

    /**
     * @return list<array{fitting_id: int, ships: int}>
     */
    public function selections(): array
    {
        return array_map(
            fn (array $s) => ['fitting_id' => (int) $s['fitting_id'], 'ships' => (int) $s['ships']],
            $this->validated('selections')
        );
    }

    /**
     * @return list<int>
     */
    public function locationIds(): array
    {
        return array_values(array_map('intval', $this->validated('location_ids') ?? []));
    }

    public function includeHull(): bool
    {
        return (bool) ($this->validated('include_hull') ?? true);
    }

    public function countFittedShips(): bool
    {
        return (bool) ($this->validated('count_fitted_ships') ?? true);
    }
}
