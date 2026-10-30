<?php

namespace App\Services\Fittings;

use App\Models\Fitting;
use App\Models\User;

/**
 * Creates, changes and deletes a user's fittings.
 */
class FittingWriter
{
    public function __construct(private FittingImporter $importer) {}

    public function create(User $user, string $eft, ?string $name, bool $ignoreUnmatched = false): Fitting
    {
        return $user->fittings()->create($this->importer->attributes($eft, $name, $ignoreUnmatched));
    }

    /**
     * Rename, or re-import from new EFT text (the name is kept unless sent).
     */
    public function update(Fitting $fitting, ?string $eft, ?string $name, bool $ignoreUnmatched = false): Fitting
    {
        if ($eft !== null) {
            $fitting->update($this->importer->attributes($eft, $name ?? $fitting->name, $ignoreUnmatched));
        } elseif ($name !== null) {
            $fitting->update(['name' => $name]);
        }

        return $fitting->fresh();
    }

    public function delete(Fitting $fitting): void
    {
        $fitting->delete();
    }
}
