<?php

namespace Tests\Unit;

use App\Services\Fittings\ShipFitChecker;
use PHPUnit\Framework\TestCase;

class ShipFitCheckerTest extends TestCase
{
    private const REQUIRED = [
        10 => ['name' => 'Damage Control II', 'quantity' => 1],
        20 => ['name' => 'Launcher', 'quantity' => 3],
    ];

    public function test_a_ship_with_everything_fitted_is_fitted(): void
    {
        $result = (new ShipFitChecker)->check(self::REQUIRED, [10 => 1, 20 => 3]);

        $this->assertSame(ShipFitChecker::FITTED, $result['status']);
        $this->assertSame([4, 4, []], [$result['fitted_count'], $result['total_count'], $result['missing']]);
    }

    public function test_extra_items_do_not_stop_a_ship_counting_as_fitted(): void
    {
        $result = (new ShipFitChecker)->check(self::REQUIRED, [10 => 1, 20 => 3, 30 => 2]);

        $this->assertSame(ShipFitChecker::FITTED, $result['status']);
        $this->assertSame([['type_id' => 30, 'quantity' => 2]], $result['extra']);
    }

    public function test_a_ship_missing_some_items_is_partial_and_lists_them(): void
    {
        $result = (new ShipFitChecker)->check(self::REQUIRED, [10 => 1, 20 => 1]);

        $this->assertSame(ShipFitChecker::PARTIAL, $result['status']);
        $this->assertSame([2, 4], [$result['fitted_count'], $result['total_count']]);
        $this->assertSame([['type_id' => 20, 'name' => 'Launcher', 'quantity' => 2]], $result['missing']);
    }

    public function test_a_bare_hull_or_one_fitted_with_other_things_is_none(): void
    {
        $this->assertSame(ShipFitChecker::NONE, (new ShipFitChecker)->check(self::REQUIRED, [])['status']);
        $this->assertSame(ShipFitChecker::NONE, (new ShipFitChecker)->check(self::REQUIRED, [99 => 5])['status']);
    }

    public function test_a_fitting_with_nothing_in_its_slots_never_counts(): void
    {
        $this->assertSame(ShipFitChecker::NONE, (new ShipFitChecker)->check([], [10 => 1])['status']);
    }
}
