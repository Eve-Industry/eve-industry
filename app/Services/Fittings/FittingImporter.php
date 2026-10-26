<?php

namespace App\Services\Fittings;

use Illuminate\Validation\ValidationException;

/**
 * Turns pasted EFT text into the attributes stored on a Fitting or
 * CorporationFitting. Shared by the personal and corporate writers.
 */
class FittingImporter
{
    public function __construct(private EftParser $parser) {}

    /**
     * @return array{name: string, ship_type_id: int, ship_type_name: string, items: list<array<string, mixed>>, raw_eft: string}
     *
     * @throws ValidationException 422 on `eft` for an unknown hull, no items, or
     *                             unknown names unless $ignoreUnmatched
     */
    public function attributes(string $eft, ?string $name = null, bool $ignoreUnmatched = false): array
    {
        $parsed = $this->parser->parse($eft);

        if ($parsed['ship'] === null) {
            throw ValidationException::withMessages(['eft' => 'The ship hull in the fitting header was not recognised.']);
        }
        if ($parsed['items'] === []) {
            throw ValidationException::withMessages(['eft' => 'No items were found in the fitting.']);
        }
        if ($parsed['unmatched'] !== [] && ! $ignoreUnmatched) {
            throw ValidationException::withMessages([
                'eft' => 'Unknown items: '.implode(', ', $parsed['unmatched']).'.',
            ]);
        }

        return [
            'name' => $name !== null && $name !== '' ? $name : mb_substr($parsed['name'] ?: $parsed['ship']['name'], 0, 100),
            'ship_type_id' => $parsed['ship']['type_id'],
            'ship_type_name' => $parsed['ship']['name'],
            'items' => $parsed['items'],
            'raw_eft' => $eft,
        ];
    }
}
