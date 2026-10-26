<?php

namespace Tests\Feature\ApiV1\Fittings;

use App\Models\BlueprintActivity;
use App\Models\CorporationFitting;
use App\Models\EveType;
use App\Models\Fitting;
use App\Services\EsiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\Feature\LegacyApi\Programs\ProgramsFixtures;
use Tests\TestCase;

class CorporationFittingTest extends TestCase
{
    use ProgramsFixtures, RefreshDatabase;

    private const RESOURCE_KEYS = ['id', 'corporation_id', 'created_by_user_id', 'name', 'ship_type_id', 'ship_type_name', 'items', 'created_at', 'updated_at'];

    private const EFT = "[Typhoon, CorpBus]\nDamage Control II\n\n\n\nNavy Mjolnir Missile x100\n";

    protected function setUp(): void
    {
        parent::setUp();
        foreach ([1 => 'Typhoon', 2 => 'Damage Control II', 3 => 'Navy Mjolnir Missile', 34 => 'Tritanium'] as $id => $name) {
            EveType::create(['type_id' => $id, 'name' => $name]);
        }
    }

    private function corpFitting(int $corporationId = 98000001, array $attrs = []): CorporationFitting
    {
        return CorporationFitting::create(array_merge([
            'corporation_id' => $corporationId,
            'created_by_user_id' => $this->makeUser()->id,
            'name' => 'CorpBus',
            'ship_type_id' => 1,
            'ship_type_name' => 'Typhoon',
            'items' => [
                ['type_id' => 2, 'name' => 'Damage Control II', 'quantity' => 1, 'section' => 'fitted'],
                ['type_id' => 3, 'name' => 'Navy Mjolnir Missile', 'quantity' => 100, 'section' => 'cargo'],
            ],
        ], $attrs));
    }

    private function mockEsi(array $assets, array $blueprints = []): void
    {
        $this->mock(EsiService::class, function (MockInterface $mock) use ($assets, $blueprints) {
            $mock->shouldReceive('getCorporationAssets')->andReturn($assets);
            $mock->shouldReceive('getCorporationBlueprints')->andReturn($blueprints);
        });
    }

    private function corpAsset(int $id, int $typeId, int $quantity, string $flag = 'Hangar'): array
    {
        return [
            'item_id' => $id, 'type_id' => $typeId, 'quantity' => $quantity,
            'location_id' => 60003760, 'location_type' => 'station', 'location_flag' => $flag,
        ];
    }

    public function test_requires_auth(): void
    {
        $this->getJson('/api/v1/corporation/fittings')->assertStatus(401)->assertJsonPath('code', 'unauthenticated');
        $this->postJson('/api/v1/corporation/fittings', [])->assertStatus(401);
        $this->putJson('/api/v1/corporation/fittings/1', [])->assertStatus(401);
        $this->deleteJson('/api/v1/corporation/fittings/1')->assertStatus(401);
        $this->postJson('/api/v1/corporation/fitting-program/plan', [])->assertStatus(401);
        $this->postJson('/api/v1/corporation/fitting-program/build-program', [])->assertStatus(401);
    }

    public function test_manager_can_store_update_and_delete(): void
    {
        $user = $this->corpUser('factory');

        $id = $this->actingAs($user)->postJson('/api/v1/corporation/fittings', ['eft' => self::EFT])
            ->assertCreated()
            ->assertJsonStructure(['data' => self::RESOURCE_KEYS])
            ->assertJsonPath('data.corporation_id', 98000001)
            ->assertJsonPath('data.created_by_user_id', $user->id)
            ->assertJsonPath('data.name', 'CorpBus')
            ->json('data.id');

        $this->actingAs($user)->putJson("/api/v1/corporation/fittings/{$id}", ['name' => 'Renamed'])
            ->assertOk()->assertJsonPath('data.name', 'Renamed');
        $this->actingAs($user)->deleteJson("/api/v1/corporation/fittings/{$id}")->assertNoContent();
        $this->assertSame(0, CorporationFitting::count());
    }

    public function test_store_is_403_without_the_feature_or_role(): void
    {
        $stranger = $this->makeUser();
        $this->makeCharacter($stranger, ['corporation_id' => 98000777]);
        $member = $this->corpUser('member');

        $this->actingAs($stranger)->postJson('/api/v1/corporation/fittings', ['eft' => self::EFT])
            ->assertForbidden()->assertJsonPath('message', 'Corporate build programs not enabled');
        $this->actingAs($member)->postJson('/api/v1/corporation/fittings', ['eft' => self::EFT])
            ->assertForbidden()->assertJsonPath('message', 'Insufficient role. Director, CEO, or Factory Manager required.');
        $this->assertSame(0, CorporationFitting::count());
    }

    public function test_store_validation_is_422(): void
    {
        $this->actingAs($this->corpUser())->postJson('/api/v1/corporation/fittings', [])
            ->assertStatus(422)->assertJsonValidationErrors(['eft']);
    }

    public function test_members_can_view_but_not_change(): void
    {
        $member = $this->corpUser('member');
        $fitting = $this->corpFitting();

        $this->actingAs($member)->getJson('/api/v1/corporation/fittings')
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.can_view', true)
            ->assertJsonPath('data.can_manage', false)
            ->assertJsonPath('data.corporation_name', 'Test Corp')
            ->assertJsonCount(1, 'data.fittings');
        $this->actingAs($member)->getJson("/api/v1/corporation/fittings/{$fitting->id}")->assertOk();
        $this->actingAs($member)->putJson("/api/v1/corporation/fittings/{$fitting->id}", ['name' => 'x'])->assertNotFound();
        $this->actingAs($member)->deleteJson("/api/v1/corporation/fittings/{$fitting->id}")->assertNotFound();
        $this->assertSame('CorpBus', $fitting->fresh()->name);
    }

    public function test_index_is_empty_not_forbidden_without_the_feature(): void
    {
        $stranger = $this->makeUser();
        $this->makeCharacter($stranger, ['corporation_id' => 98000777]);

        $this->actingAs($stranger)->getJson('/api/v1/corporation/fittings')
            ->assertOk()->assertJsonPath('data.enabled', false)->assertJsonPath('data.can_view', false)->assertJsonPath('data.fittings', []);
    }

    public function test_other_corporations_fittings_are_hidden(): void
    {
        $user = $this->corpUser();
        $other = $this->corpFitting(98000777);

        $this->actingAs($user)->getJson('/api/v1/corporation/fittings')->assertOk()->assertJsonCount(0, 'data.fittings');
        $this->actingAs($user)->getJson("/api/v1/corporation/fittings/{$other->id}")->assertNotFound();
        $this->actingAs($user)->putJson("/api/v1/corporation/fittings/{$other->id}", ['name' => 'x'])->assertNotFound();
        $this->actingAs($user)->deleteJson("/api/v1/corporation/fittings/{$other->id}")->assertNotFound();
    }

    public function test_personal_and_corporate_fittings_are_separate(): void
    {
        $user = $this->corpUser();
        $personal = Fitting::create(['user_id' => $user->id, 'name' => 'Mine', 'ship_type_id' => 1, 'ship_type_name' => 'Typhoon', 'items' => []]);
        $corporate = $this->corpFitting();

        $this->actingAs($user)->getJson('/api/v1/fittings')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $personal->id);

        // Each table numbers its own ids, so the same id means a different fitting on each side.
        $this->mockEsi([]);
        $this->assertSame($personal->id, $corporate->id);
        $this->actingAs($user)->postJson('/api/v1/fitting-program/plan', ['selections' => [['fitting_id' => $personal->id, 'ships' => 1]]])
            ->assertOk()->assertJsonPath('data.fittings.0.name', 'Mine');
        $this->actingAs($user)->postJson('/api/v1/corporation/fitting-program/plan', ['selections' => [['fitting_id' => $corporate->id, 'ships' => 1]]])
            ->assertOk()->assertJsonPath('data.plan.fittings.0.name', 'CorpBus');

        // A fitting that exists only on the other side is rejected.
        $this->actingAs($user)->postJson('/api/v1/corporation/fitting-program/plan', ['selections' => [['fitting_id' => $personal->id + 1, 'ships' => 1]]])
            ->assertStatus(422)->assertJsonValidationErrors(['selections.0.fitting_id']);
    }

    public function test_plan_counts_only_corporation_assets(): void
    {
        $user = $this->corpUser('member');
        $fitting = $this->corpFitting();
        $this->mockEsi([
            $this->corpAsset(1, 1, 1),
            $this->corpAsset(2, 2, 1),
            $this->corpAsset(3, 3, 150),
            $this->corpAsset(4, 2, 9, 'MedSlot0'),
        ]);

        $response = $this->actingAs($user)->postJson('/api/v1/corporation/fitting-program/plan', [
            'selections' => [['fitting_id' => $fitting->id, 'ships' => 2]],
        ])->assertOk()
            ->assertJsonPath('data.character_name', 'Main Pilot')
            ->assertJsonPath('data.plan.fittings.0.ships_fittable', 1)
            ->assertJsonPath('data.plan.summary.complete', false);

        $items = collect($response->json('data.plan.items'))->keyBy('type_id');
        $this->assertSame([2, 1, 1], [$items[1]['required'], $items[1]['on_hand'], $items[1]['missing']]);
        $this->assertSame([2, 1, 1], [$items[2]['required'], $items[2]['on_hand'], $items[2]['missing']]);
        $this->assertSame([200, 150, 50], [$items[3]['required'], $items[3]['on_hand'], $items[3]['missing']]);
    }

    public function test_plan_flags_owned_corporation_blueprints(): void
    {
        BlueprintActivity::create([
            'blueprint_type_id' => 1000, 'activity_id' => BlueprintActivity::ACTIVITY_MANUFACTURING, 'time' => 100,
            'materials' => [['type_id' => 34, 'quantity' => 10]], 'products' => [['type_id' => 2, 'quantity' => 1]],
        ]);
        $user = $this->corpUser('member');
        $fitting = $this->corpFitting();
        $this->mockEsi([$this->corpAsset(1, 1, 5), $this->corpAsset(3, 3, 500)], [['type_id' => 1000, 'material_efficiency' => 10]]);

        $items = collect($this->actingAs($user)->postJson('/api/v1/corporation/fitting-program/plan', [
            'selections' => [['fitting_id' => $fitting->id, 'ships' => 1]],
        ])->assertOk()->json('data.plan.items'))->keyBy('type_id');

        $this->assertTrue($items[2]['buildable']);
        $this->assertTrue($items[2]['blueprint_owned']);
    }

    public function test_plan_is_404_without_the_feature_and_403_without_a_character_there(): void
    {
        $stranger = $this->makeUser();
        $this->makeCharacter($stranger, ['corporation_id' => 98000777]);

        $this->actingAs($stranger)->postJson('/api/v1/corporation/fitting-program/plan', [
            'selections' => [['fitting_id' => 1, 'ships' => 1]],
        ])->assertNotFound();
    }

    public function test_build_program_needs_a_manager_and_creates_a_corporate_program(): void
    {
        BlueprintActivity::create([
            'blueprint_type_id' => 1000, 'activity_id' => BlueprintActivity::ACTIVITY_MANUFACTURING, 'time' => 100,
            'materials' => [['type_id' => 34, 'quantity' => 10]], 'products' => [['type_id' => 2, 'quantity' => 1]],
        ]);
        $fitting = $this->corpFitting();
        $payload = ['name' => 'Backfill', 'selections' => [['fitting_id' => $fitting->id, 'ships' => 2]]];
        $this->mockEsi([$this->corpAsset(1, 1, 2), $this->corpAsset(3, 3, 200)]);

        $member = $this->corpUser('member');
        $this->actingAs($member)->postJson('/api/v1/corporation/fitting-program/build-program', $payload)->assertForbidden();

        $manager = $this->corpUser('factory');
        $this->actingAs($manager)->postJson('/api/v1/corporation/fitting-program/build-program', $payload)
            ->assertCreated()
            ->assertJsonPath('data.corporation_id', 98000001)
            ->assertJsonPath('data.created_by_user_id', $manager->id)
            ->assertJsonPath('data.steps.0.type_id', 2)
            ->assertJsonPath('data.steps.0.quantity_required', 2);
    }
}
