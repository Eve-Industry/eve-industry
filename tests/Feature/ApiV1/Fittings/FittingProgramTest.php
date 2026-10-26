<?php

namespace Tests\Feature\ApiV1\Fittings;

use App\Models\BlueprintActivity;
use App\Models\EveType;
use App\Models\Fitting;
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
            EveType::create(['type_id' => $id, 'name' => $name]);
        }
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

    private function asset(int $id, int $typeId, int $quantity, string $owner = 'personal', string $flag = 'Hangar'): array
    {
        return [
            'item_id' => $id, 'type_id' => $typeId, 'type_name' => "Type {$typeId}", 'name' => null, 'quantity' => $quantity,
            'location_id' => 60003760, 'location_name' => 'Jita station', 'location_flag' => $flag,
            'character_id' => 42, 'character_name' => 'Main Pilot', 'owner_type' => $owner,
            'parent_item_id' => null, 'is_singleton' => false, 'corporation_name' => null,
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

    public function test_build_program_can_be_limited_to_chosen_types(): void
    {
        $this->publish([$this->asset(1, self::HULL, 2)], 'personal', 42);

        $this->actingAs($this->user)
            ->postJson('/api/v1/fitting-program/build-program', $this->payload(['name' => 'Only', 'type_ids' => [self::MISSILE]]))
            ->assertStatus(422);
    }
}
