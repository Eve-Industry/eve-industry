<?php

namespace App\Http\Resources\V1\Fittings;

use App\Models\Fitting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A personal ship fitting.
 *
 * @mixin Fitting
 */
class FittingResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (int) $this->id,
            'name' => (string) $this->name,
            'ship_type_id' => (int) $this->ship_type_id,
            'ship_type_name' => (string) $this->ship_type_name,
            /** @var list<array{type_id: int, name: string, quantity: int, section: string}> `section` is `fitted` or `cargo`. */
            'items' => $this->items ?? [],
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
