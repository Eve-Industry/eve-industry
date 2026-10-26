<?php

namespace App\Services\Fittings;

use App\Models\CorporationFitting;
use App\Models\User;

/**
 * Creates, changes and deletes corporate fittings. Who may do it is decided
 * by the caller (CorporationFittingPolicy), not here.
 */
class CorporationFittingWriter
{
    public function __construct(private FittingImporter $importer) {}

    public function create(int $corporationId, User $user, string $eft, ?string $name, bool $ignoreUnmatched = false): CorporationFitting
    {
        return CorporationFitting::create(
            $this->importer->attributes($eft, $name, $ignoreUnmatched)
            + ['corporation_id' => $corporationId, 'created_by_user_id' => $user->id]
        );
    }

    public function update(CorporationFitting $fitting, ?string $eft, ?string $name, bool $ignoreUnmatched = false): CorporationFitting
    {
        if ($eft !== null) {
            $fitting->update($this->importer->attributes($eft, $name ?? $fitting->name, $ignoreUnmatched));
        } elseif ($name !== null) {
            $fitting->update(['name' => $name]);
        }

        return $fitting->fresh();
    }

    public function delete(CorporationFitting $fitting): void
    {
        $fitting->delete();
    }
}
