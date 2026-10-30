<?php

namespace Tests\Feature\ApiV1\Fittings;

use App\Models\BlueprintActivity;
use App\Models\EveType;
use App\Models\Fitting;
use App\Models\InvGroup;
use App\Models\User;
use App\Services\AssetSnapshotStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\Feature\LegacyApi\Programs\ProgramsFixtures;
use Tests\TestCase;

class FittingProgramTest extends TestCase
{
    use ProgramsFixtures, RefreshDatabase;

    private const HULL = 1;

    private const DAMAGE_CONTROL = 2;

    private const MISSILE = 3;

    private User $user;

    private Fitting $fitting;

    protected function setUp(): void
    {
        parent::setUp();
        config(['assets.durable_snapshots' => true, 'esi.coordination_store' => 'array']);
        Queue::fake();
        Http::preventStrayRequests();

        foreach ([self::HULL => 'Typhoon', self::DAMAGE_CONTROL => 'Damage Control II', self::MISSILE => 'Navy Mjolnir Missile', 34 => 'Tritanium'] as $id => $name) {
            // The hull is a ship, so anything inside one can be told apart from stock.
            EveType::create(['type_id' => $id, 'name' => $name, 'group_id' => $id === self::HULL ? 25 : null]);
        }
        InvGroup::create(['group_id' => 25, 'name' => 'Frigate', 'category_id' => 6, 'published' => true]);
        BlueprintActivity::create([
            'blueprint_type_id' => 1000,
            'activity_id' => BlueprintActivity::ACTIVITY_MANUFACTURING,
            'time' => 100,
            'materials' => [['type_id' => 34, 'name' => 'Tritanium', 'quantity' => 10]],
            'products' => [['type_id' => self::DAMAGE_CONTROL, 'quantity' => 1]],
        ]);

        $this->user = $this->makeUser(['last_login_at' => now()]);
        $this->makeCharacter($this->user, [
            'character_id' => 42, 'is_esi_active' => true, 'is_director_ceo' => true,
            'scopes' => ['esi-assets.read_assets.v1', 'esi-assets.read_corporation_assets.v1'],
        ]);
        $this->fitting = Fitting::create([
            'user_id' => $this->user->id,
            'name' => 'BaitBus',
            'ship_type_id' => self::HULL,
            'ship_type_name' => 'Typhoon',
            'items' => [
                ['type_id' => self::DAMAGE_CONTROL, 'name' => 'Damage Control II', 'quantity' => 1, 'section' => 'fitted'],
                ['type_id' => self::MISSILE, 'name' => 'Navy Mjolnir Missile', 'quantity' => 100, 'section' => 'cargo'],
            ],
        ]);
    }

    /** An asset in the Jita hangar, or inside the item `$parent` (a ship, for fitted modules). */
    private function asset(int $id, int $typeId, int $quantity, string $owner = 'personal', string $flag = 'Hangar', ?int $parent = null): array
    {
        return [
            'item_id' => $id, 'type_id' => $typeId, 'type_name' => "Type {$typeId}", 'name' => null, 'quantity' => $quantity,
            'location_id' => $parent ?? 60003760, 'location_name' => 'Jita station', 'location_flag' => $flag,
            'character_id' => 42, 'character_name' => 'Main Pilot', 'owner_type' => $owner,
            'parent_item_id' => $parent, 'is_singleton' => $parent === null && $typeId === self::HULL, 'corporation_name' => null,
        ];
    }

    private function publish(array $items, string $type, int $owner): void
    {
        $store = new AssetSnapshotStore;
        $snapshot = $store->begin($type, $owner);
        $store->publish($snapshot, $items, $items, [
            'source_updated_at' => now()->subHour()->timestamp,
            'validated_at' => now()->subMinute()->timestamp,
            'source_expires_at' => now()->addMinutes(10)->timestamp,
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge(['selections' => [['fitting_id' => $this->fitting->id, 'ships' => 2]]], $overrides);
    }

    private function itemsByType(array $json): array
    {
        return collect($json['data']['items'])->keyBy('type_id')->all();
    }

    public function test_plan_counts_only_personal_stock_and_reports_the_shortfall(): void
    {
        $this->publish([
            $this->asset(1, self::HULL, 1),
            $this->asset(2, self::DAMAGE_CONTROL, 1),
            $this->asset(3, self::MISSILE, 150),
            // A module fitted to a ship is not stock.
            $this->asset(4, self::DAMAGE_CONTROL, 5, flag: 'LoSlot0'),
        ], 'personal', 42);
        // The corporation holds plenty, but personal planning must not see it.
        $this->publish([
            $this->asset(10, self::HULL, 50, 'corporate'),
            $this->asset(11, self::DAMAGE_CONTROL, 50, 'corporate'),
            $this->asset(12, self::MISSILE, 5000, 'corporate'),
        ], 'corporate', 98000001);

        $response = $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', $this->payload())
            ->assertOk()
            ->assertJsonPath('data.fittings.0.ships', 2)
            ->assertJsonPath('data.fittings.0.ships_fittable', 1)
            ->assertJsonPath('data.summary.complete', false)
            ->assertJsonPath('data.summary.missing_types', 3);

        $items = $this->itemsByType($response->json());
        $this->assertSame(['required' => 2, 'on_hand' => 1, 'missing' => 1], [
            'required' => $items[self::HULL]['required'], 'on_hand' => $items[self::HULL]['on_hand'], 'missing' => $items[self::HULL]['missing'],
        ]);
        $this->assertSame([2, 1, 1], [$items[self::DAMAGE_CONTROL]['required'], $items[self::DAMAGE_CONTROL]['on_hand'], $items[self::DAMAGE_CONTROL]['missing']]);
        $this->assertSame([200, 150, 50], [$items[self::MISSILE]['required'], $items[self::MISSILE]['on_hand'], $items[self::MISSILE]['missing']]);

        $this->assertTrue($items[self::DAMAGE_CONTROL]['buildable']);
        $this->assertSame(1000, $items[self::DAMAGE_CONTROL]['blueprint_type_id']);
        $this->assertFalse($items[self::DAMAGE_CONTROL]['blueprint_owned']);
        $this->assertFalse($items[self::MISSILE]['buildable']);
        $this->assertSame('hull', $items[self::HULL]['kind']);
    }

    public function test_plan_can_leave_out_the_hull(): void
    {
        $this->publish([$this->asset(2, self::DAMAGE_CONTROL, 2), $this->asset(3, self::MISSILE, 200)], 'personal', 42);

        $response = $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', $this->payload(['include_hull' => false]))
            ->assertOk()
            ->assertJsonPath('data.summary.complete', true)
            ->assertJsonPath('data.fittings.0.ships_fittable', 2);

        $this->assertArrayNotHasKey(self::HULL, $this->itemsByType($response->json()));
    }

    public function test_plan_limits_stock_to_the_chosen_locations(): void
    {
        $this->publish([$this->asset(2, self::DAMAGE_CONTROL, 2), $this->asset(3, self::MISSILE, 200)], 'personal', 42);

        $response = $this->actingAs($this->user)
            ->postJson('/api/v1/fitting-program/plan', $this->payload(['include_hull' => false, 'location_ids' => [60000004]]))
            ->assertOk()->assertJsonPath('data.fittings.0.ships_fittable', 0);

        $this->assertSame(0, $this->itemsByType($response->json())[self::DAMAGE_CONTROL]['on_hand']);
    }

    public function test_plan_validation_is_422(): void
    {
        $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', [])
            ->assertStatus(422)->assertJsonValidationErrors(['selections']);
        $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', ['selections' => [['fitting_id' => $this->fitting->id, 'ships' => 0]]])
            ->assertStatus(422)->assertJsonValidationErrors(['selections.0.ships']);
    }

    public function test_plan_rejects_another_users_fitting(): void
    {
        $theirs = Fitting::create([
            'user_id' => $this->makeUser()->id, 'name' => 'Theirs', 'ship_type_id' => self::HULL, 'ship_type_name' => 'Typhoon', 'items' => [],
        ]);

        $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', ['selections' => [['fitting_id' => $theirs->id, 'ships' => 1]]])
            ->assertStatus(422)->assertJsonValidationErrors(['selections.0.fitting_id']);
    }

    public function test_build_program_covers_the_missing_buildable_items(): void
    {
        $this->publish([$this->asset(1, self::HULL, 2), $this->asset(3, self::MISSILE, 200)], 'personal', 42);

        $this->actingAs($this->user)->postJson('/api/v1/fitting-program/build-program', $this->payload(['name' => 'Backfill']))
            ->assertCreated()
            ->assertJsonPath('data.name', 'Backfill')
            ->assertJsonCount(1, 'data.steps')
            ->assertJsonPath('data.steps.0.type_id', self::DAMAGE_CONTROL)
            ->assertJsonPath('data.steps.0.quantity_required', 2)
            ->assertJsonPath('data.steps.0.blueprint_type_id', 1000);

        $this->assertSame(1, $this->user->buildPrograms()->count());
    }

    public function test_build_program_is_422_when_nothing_can_be_built(): void
    {
        // Everything but the missiles is on hand, and missiles have no blueprint.
        $this->publish([$this->asset(1, self::HULL, 2), $this->asset(2, self::DAMAGE_CONTROL, 2)], 'personal', 42);

        $this->actingAs($this->user)->postJson('/api/v1/fitting-program/build-program', $this->payload(['name' => 'Backfill']))
            ->assertStatus(422)->assertJsonValidationErrors(['type_ids']);
        $this->assertSame(0, $this->user->buildPrograms()->count());
    }

    public function test_fully_fitted_ships_count_and_are_not_planned_again(): void
    {
        $this->publish([
            $this->asset(100, self::HULL, 1),
            $this->asset(101, self::DAMAGE_CONTROL, 1, flag: 'LoSlot0', parent: 100),
            $this->asset(3, self::MISSILE, 150),
        ], 'personal', 42);

        $response = $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', $this->payload())
            ->assertOk()
            ->assertJsonPath('data.fittings.0.ships_fitted', 1)
            ->assertJsonPath('data.fittings.0.ships_fittable', 1)
            ->assertJsonPath('data.fittings.0.existing_ships.0.item_id', 100)
            ->assertJsonPath('data.fittings.0.existing_ships.0.status', 'fitted')
            ->assertJsonPath('data.fittings.0.existing_ships.0.counted', true)
            ->assertJsonPath('data.fittings.0.existing_ships.0.location_name', 'Jita station')
            ->assertJsonPath('data.fittings.0.existing_ships.0.fitted_count', 1);

        $items = $this->itemsByType($response->json());
        // One ship is done, so only one more hull and set of slot items is needed; the hull of
        // the fitted ship is not a spare. Cargo is still needed for both ships.
        $this->assertSame([1, 0, 1], [$items[self::HULL]['required'], $items[self::HULL]['on_hand'], $items[self::HULL]['missing']]);
        $this->assertSame([1, 0, 1], [$items[self::DAMAGE_CONTROL]['required'], $items[self::DAMAGE_CONTROL]['on_hand'], $items[self::DAMAGE_CONTROL]['missing']]);
        $this->assertSame([200, 150, 50], [$items[self::MISSILE]['required'], $items[self::MISSILE]['on_hand'], $items[self::MISSILE]['missing']]);
    }

    public function test_a_listed_ship_includes_its_contents_with_their_slots(): void
    {
        $this->publish([
            $this->asset(100, self::HULL, 1),
            // Listed out of order on purpose: cargo and the drone bay first.
            $this->asset(103, self::MISSILE, 250, flag: 'Cargo', parent: 100),
            $this->asset(104, 4, 5, flag: 'DroneBay', parent: 100),
            $this->asset(102, 4, 1, flag: 'MedSlot1', parent: 100),
            $this->asset(101, self::DAMAGE_CONTROL, 1, flag: 'LoSlot0', parent: 100),
            $this->asset(105, self::MISSILE, 1, flag: 'HiSlot0', parent: 100),
        ], 'personal', 42);

        $response = $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', $this->payload())
            ->assertOk()
            ->assertJsonPath('data.fittings.0.existing_ships.0.item_id', 100);

        $contents = $response->json('data.fittings.0.existing_ships.0.contents');
        // Slots first in high, mid, low order, then the holds by name.
        $this->assertSame(['HiSlot0', 'MedSlot1', 'LoSlot0', 'Cargo', 'DroneBay'], array_column($contents, 'flag'));
        $this->assertSame(
            ['type_id' => self::MISSILE, 'name' => 'Type 3', 'quantity' => 250, 'flag' => 'Cargo'],
            $contents[3]
        );
    }

    public function test_nothing_inside_a_ship_counts_as_available(): void
    {
        $this->publish([
            // 150 missiles loose in the hangar, and a container of 40 there too.
            $this->asset(3, self::MISSILE, 150),
            $this->asset(50, 9, 1),
            $this->asset(51, self::MISSILE, 40, parent: 50),
            // A ship holding missiles in cargo and drone bay, plus a container with more
            // missiles in its cargo, and a spare module in the drone bay.
            $this->asset(100, self::HULL, 1),
            $this->asset(101, self::MISSILE, 250, flag: 'Cargo', parent: 100),
            $this->asset(102, self::MISSILE, 60, flag: 'DroneBay', parent: 100),
            $this->asset(103, 9, 1, flag: 'Cargo', parent: 100),
            $this->asset(104, self::MISSILE, 500, parent: 103),
            $this->asset(105, self::DAMAGE_CONTROL, 3, flag: 'Cargo', parent: 100),
            // Another ship carrying a whole ship in its maintenance bay.
            $this->asset(200, self::HULL, 1),
            $this->asset(201, self::HULL, 1, flag: 'ShipHangar', parent: 200),
        ], 'personal', 42);

        $response = $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', $this->payload(['count_fitted_ships' => false]))
            ->assertOk();

        $items = $this->itemsByType($response->json());
        // Only the hangar missiles count, in the loose stack and the container there.
        $this->assertSame(190, $items[self::MISSILE]['on_hand']);
        // Likewise the Damage Control stowed in a ship's cargo is not available.
        $this->assertSame(0, $items[self::DAMAGE_CONTROL]['on_hand']);
        // The two ships themselves are in a hangar, the hull inside the second one is not.
        $this->assertSame(2, $items[self::HULL]['on_hand']);
    }

    public function test_a_ship_without_anything_inside_has_empty_contents(): void
    {
        $this->publish([
            $this->asset(100, self::HULL, 1),
            $this->asset(101, self::DAMAGE_CONTROL, 1, flag: 'LoSlot0', parent: 100),
        ], 'personal', 42);

        $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', $this->payload())
            ->assertOk()
            ->assertJsonCount(1, 'data.fittings.0.existing_ships.0.contents');
    }

    public function test_fitted_ships_beyond_the_wanted_number_are_listed_but_not_counted(): void
    {
        $this->publish([
            $this->asset(100, self::HULL, 1),
            $this->asset(101, self::DAMAGE_CONTROL, 1, flag: 'LoSlot0', parent: 100),
            $this->asset(200, self::HULL, 1),
            $this->asset(201, self::DAMAGE_CONTROL, 1, flag: 'LoSlot0', parent: 200),
        ], 'personal', 42);

        $this->actingAs($this->user)
            ->postJson('/api/v1/fitting-program/plan', $this->payload(['selections' => [['fitting_id' => $this->fitting->id, 'ships' => 1]]]))
            ->assertOk()
            ->assertJsonPath('data.fittings.0.ships_fitted', 1)
            ->assertJsonCount(2, 'data.fittings.0.existing_ships')
            ->assertJsonPath('data.fittings.0.existing_ships.0.counted', true)
            ->assertJsonPath('data.fittings.0.existing_ships.1.counted', false);
    }

    public function test_partly_fitted_ships_are_listed_with_what_they_lack_and_do_not_count(): void
    {
        EveType::create(['type_id' => 4, 'name' => 'Ballistic Control System II']);
        $two = Fitting::create([
            'user_id' => $this->user->id, 'name' => 'Two slots', 'ship_type_id' => self::HULL, 'ship_type_name' => 'Typhoon',
            'items' => [
                ['type_id' => self::DAMAGE_CONTROL, 'name' => 'Damage Control II', 'quantity' => 1, 'section' => 'fitted'],
                ['type_id' => 4, 'name' => 'Ballistic Control System II', 'quantity' => 1, 'section' => 'fitted'],
            ],
        ]);
        $this->publish([
            $this->asset(100, self::HULL, 1),
            $this->asset(101, self::DAMAGE_CONTROL, 1, flag: 'LoSlot0', parent: 100),
            // A bare hull is not listed.
            $this->asset(200, self::HULL, 1),
        ], 'personal', 42);

        $this->actingAs($this->user)
            ->postJson('/api/v1/fitting-program/plan', ['selections' => [['fitting_id' => $two->id, 'ships' => 1]]])
            ->assertOk()
            ->assertJsonPath('data.fittings.0.ships_fitted', 0)
            ->assertJsonCount(1, 'data.fittings.0.existing_ships')
            ->assertJsonPath('data.fittings.0.existing_ships.0.status', 'partial')
            ->assertJsonPath('data.fittings.0.existing_ships.0.counted', false)
            ->assertJsonPath('data.fittings.0.existing_ships.0.fitted_count', 1)
            ->assertJsonPath('data.fittings.0.existing_ships.0.total_count', 2)
            ->assertJsonPath('data.fittings.0.existing_ships.0.missing.0.name', 'Ballistic Control System II');
    }

    public function test_counting_fitted_ships_can_be_turned_off(): void
    {
        $this->publish([
            $this->asset(100, self::HULL, 1),
            $this->asset(101, self::DAMAGE_CONTROL, 1, flag: 'LoSlot0', parent: 100),
        ], 'personal', 42);

        $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', $this->payload(['count_fitted_ships' => false]))
            ->assertOk()
            ->assertJsonPath('data.fittings.0.ships_fitted', 0)
            ->assertJsonPath('data.fittings.0.existing_ships.0.status', 'fitted')
            ->assertJsonPath('data.fittings.0.existing_ships.0.counted', false);
    }

    public function test_corporate_ships_do_not_count_for_personal_planning(): void
    {
        $this->publish([
            $this->asset(100, self::HULL, 1, 'corporate'),
            $this->asset(101, self::DAMAGE_CONTROL, 1, 'corporate', 'LoSlot0', 100),
        ], 'corporate', 98000001);

        $this->actingAs($this->user)->postJson('/api/v1/fitting-program/plan', $this->payload())
            ->assertOk()
            ->assertJsonPath('data.fittings.0.ships_fitted', 0)
            ->assertJsonPath('data.fittings.0.existing_ships', []);
    }

    public function test_build_program_can_be_limited_to_chosen_types(): void
    {
        $this->publish([$this->asset(1, self::HULL, 2)], 'personal', 42);

        $this->actingAs($this->user)
            ->postJson('/api/v1/fitting-program/build-program', $this->payload(['name' => 'Only', 'type_ids' => [self::MISSILE]]))
            ->assertStatus(422);
    }
}
