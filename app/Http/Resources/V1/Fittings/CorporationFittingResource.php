<?php

namespace App\Http\Resources\V1\Fittings;

use App\Models\CorporationFitting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A corporate ship fitting.
 *
 * @mixin CorporationFitting
 */
class CorporationFittingResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (int) $this->id,
            'corporation_id' => (int) $this->corporation_id,
            'created_by_user_id' => (int) $this->created_by_user_id,
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
