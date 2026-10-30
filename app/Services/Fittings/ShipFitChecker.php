<?php

namespace App\Services\Fittings;

/**
 * Compares what is fitted to an assembled ship with what a fitting needs in
 * its slots (modules, rigs and the charges loaded in them).
 */
class ShipFitChecker
{
    public const FITTED = 'fitted';

    public const PARTIAL = 'partial';

    public const NONE = 'none';

    /**
     * `status` is `fitted` when every required item is fitted (extra items do
     * not matter), `partial` when some are, and `none` for a bare hull or one
     * fitted with something else entirely.
     *
     * @param  array<int, array{name: string, quantity: int}>  $required  type_id => what one ship needs fitted
     * @param  array<int, int>  $fitted  type_id => quantity fitted to the ship
     * @return array{
     *     status: string,
     *     fitted_count: int,
     *     total_count: int,
     *     missing: list<array{type_id: int, name: string, quantity: int}>,
     *     extra: list<array{type_id: int, quantity: int}>
     * }
     */
    public function check(array $required, array $fitted): array
    {
        $total = 0;
        $matched = 0;
        $missing = [];
        foreach ($required as $typeId => $line) {
            $have = min($line['quantity'], $fitted[$typeId] ?? 0);
            $total += $line['quantity'];
            $matched += $have;
            if ($have < $line['quantity']) {
                $missing[] = ['type_id' => (int) $typeId, 'name' => $line['name'], 'quantity' => $line['quantity'] - $have];
            }
        }

        $extra = [];
        foreach ($fitted as $typeId => $quantity) {
            $surplus = $quantity - ($required[$typeId]['quantity'] ?? 0);
            if ($surplus > 0) {
                $extra[] = ['type_id' => (int) $typeId, 'quantity' => $surplus];
            }
        }

        $status = match (true) {
            $total > 0 && $matched === $total => self::FITTED,
            $matched > 0 => self::PARTIAL,
            default => self::NONE,
        };

        return [
            'status' => $status,
            'fitted_count' => $matched,
            'total_count' => $total,
            'missing' => $missing,
            'extra' => $extra,
        ];
    }
}
