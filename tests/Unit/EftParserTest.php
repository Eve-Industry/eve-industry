<?php

namespace Tests\Unit;

use App\Models\EveType;
use App\Services\Fittings\EftParser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EftParserTest extends TestCase
{
    use RefreshDatabase;

    private const SAMPLE = <<<'EFT'
[Typhoon, BaitBus]
1600mm Steel Plates II
Damage Control II

Sensor Booster II, Scan Resolution Script
Missile Guidance Computer II
Missile Guidance Computer II

Rapid Heavy Missile Launcher II, Scourge Fury Heavy Missile
Rapid Heavy Missile Launcher II, Scourge Fury Heavy Missile
[Empty High slot]

Large Trimark Armor Pump I
Large Trimark Armor Pump I



Valkyrie II x5
Scourge Fury Heavy Missile x802
nanite repair paste x250

[Typhoon, BaitBus]
EFT;

    protected function setUp(): void
    {
        parent::setUp();
        $types = [
            1 => 'Typhoon', 2 => '1600mm Steel Plates II', 3 => 'Damage Control II',
            4 => 'Sensor Booster II', 5 => 'Scan Resolution Script', 6 => 'Missile Guidance Computer II',
            7 => 'Rapid Heavy Missile Launcher II', 8 => 'Scourge Fury Heavy Missile',
            9 => 'Large Trimark Armor Pump I', 10 => 'Valkyrie II', 11 => 'Nanite Repair Paste',
        ];
        foreach ($types as $id => $name) {
            EveType::create(['type_id' => $id, 'name' => $name]);
        }
    }

    private function quantities(array $result): array
    {
        return collect($result['items'])->pluck('quantity', 'name')->all();
    }

    public function test_parses_ship_and_fit_name(): void
    {
        $result = (new EftParser)->parse(self::SAMPLE);

        $this->assertSame(['type_id' => 1, 'name' => 'Typhoon'], $result['ship']);
        $this->assertSame('BaitBus', $result['name']);
        $this->assertSame([], $result['unmatched']);
    }

    public function test_aggregates_modules_charges_and_cargo_by_type(): void
    {
        $quantities = $this->quantities((new EftParser)->parse(self::SAMPLE));

        $this->assertSame([
            '1600mm Steel Plates II' => 1,
            'Damage Control II' => 1,
            'Sensor Booster II' => 1,
            'Scan Resolution Script' => 1,
            'Missile Guidance Computer II' => 2,
            'Rapid Heavy Missile Launcher II' => 2,
            // 2 loaded charges plus 802 in cargo.
            'Scourge Fury Heavy Missile' => 804,
            'Large Trimark Armor Pump I' => 2,
            'Valkyrie II' => 5,
            'Nanite Repair Paste' => 250,
        ], $quantities);
    }

    public function test_sections_are_fitted_then_cargo(): void
    {
        $items = collect((new EftParser)->parse(self::SAMPLE)['items'])->pluck('section', 'name');

        $this->assertSame('fitted', $items['Large Trimark Armor Pump I']);
        $this->assertSame('cargo', $items['Valkyrie II']);
    }

    public function test_unknown_names_are_reported_not_fatal(): void
    {
        $result = (new EftParser)->parse("[Typhoon, X]\nDamage Control II\nMystery Module II\nFoo x3\n");

        $this->assertSame(['Mystery Module II', 'Foo'], $result['unmatched']);
        $this->assertSame(['Damage Control II' => 1], $this->quantities($result));
    }

    public function test_unknown_hull_leaves_ship_null(): void
    {
        $result = (new EftParser)->parse("[Nonexistent, X]\nDamage Control II\n");

        $this->assertNull($result['ship']);
        $this->assertContains('Damage Control II', collect($result['items'])->pluck('name')->all());
    }

    public function test_offline_suffix_and_crlf_are_handled(): void
    {
        $result = (new EftParser)->parse("[Typhoon, X]\r\nDamage Control II /OFFLINE\r\n");

        $this->assertSame(['Damage Control II' => 1], $this->quantities($result));
    }

    public function test_empty_input_has_no_ship(): void
    {
        $result = (new EftParser)->parse('');

        $this->assertNull($result['ship']);
        $this->assertSame([], $result['items']);
    }
}
