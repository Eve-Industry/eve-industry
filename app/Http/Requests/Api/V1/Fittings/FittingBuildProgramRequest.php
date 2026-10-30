<?php

namespace App\Http\Requests\Api\V1\Fittings;

/**
 * Turn the shortfall of a fitting program into a build program.
 */
class FittingBuildProgramRequest extends FittingPlanRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return parent::rules() + [
            'name' => 'required|string|max:100',
            /** Build only these missing items; omitted means every missing item that has a blueprint. */
            'type_ids' => 'nullable|array|max:500',
            'type_ids.*' => 'integer',
            /** Material efficiency to assume for the builds (default 10). */
            'me' => 'nullable|integer|min:0|max:10',
        ];
    }

    /**
     * @return list<int>|null
     */
    public function typeIds(): ?array
    {
        $ids = $this->validated('type_ids');

        return $ids === null ? null : array_values(array_map('intval', $ids));
    }

    public function meLevel(): int
    {
        return (int) ($this->validated('me') ?? 10);
    }
}
