<?php

namespace Tests\Feature\ApiV1\Fittings;

use App\Models\EveType;
use App\Models\Fitting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\LegacyApi\Programs\ProgramsFixtures;
use Tests\TestCase;

class FittingTest extends TestCase
{
    use ProgramsFixtures, RefreshDatabase;

    private const RESOURCE_KEYS = ['id', 'name', 'ship_type_id', 'ship_type_name', 'items', 'created_at', 'updated_at'];

    private const EFT = "[Typhoon, BaitBus]\nDamage Control II\n\nMissile Guidance Computer II\nMissile Guidance Computer II\n\n\n\nNavy Cap Booster 400 x5\n";

    protected function setUp(): void
    {
        parent::setUp();
        foreach ([1 => 'Typhoon', 2 => 'Damage Control II', 3 => 'Missile Guidance Computer II', 4 => 'Navy Cap Booster 400'] as $id => $name) {
            EveType::create(['type_id' => $id, 'name' => $name]);
        }
    }

    private function fitting(int $userId, array $attrs = []): Fitting
    {
        return Fitting::create(array_merge([
            'user_id' => $userId,
            'name' => 'Mine',
            'ship_type_id' => 1,
            'ship_type_name' => 'Typhoon',
            'items' => [['type_id' => 2, 'name' => 'Damage Control II', 'quantity' => 1, 'section' => 'fitted']],
        ], $attrs));
    }

    public function test_requires_auth(): void
    {
        $this->getJson('/api/v1/fittings')->assertStatus(401)->assertJsonPath('code', 'unauthenticated');
        $this->postJson('/api/v1/fittings/parse', [])->assertStatus(401);
        $this->postJson('/api/v1/fittings', [])->assertStatus(401);
        $this->putJson('/api/v1/fittings/1', [])->assertStatus(401);
        $this->deleteJson('/api/v1/fittings/1')->assertStatus(401);
        $this->postJson('/api/v1/fitting-program/plan', [])->assertStatus(401);
    }

    public function test_parse_previews_without_saving(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user)->postJson('/api/v1/fittings/parse', ['eft' => self::EFT."Mystery Item\n"])
            ->assertOk()
            ->assertJsonPath('data.ship.name', 'Typhoon')
            ->assertJsonPath('data.name', 'BaitBus')
            ->assertJsonPath('data.unmatched', ['Mystery Item'])
            ->assertJsonCount(3, 'data.items');

        $this->assertSame(0, Fitting::count());
    }

    public function test_store_returns_201_with_the_resource_and_persists(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user)->postJson('/api/v1/fittings', ['eft' => self::EFT])
            ->assertCreated()
            ->assertJsonStructure(['data' => self::RESOURCE_KEYS])
            ->assertJsonPath('data.name', 'BaitBus')
            ->assertJsonPath('data.ship_type_id', 1);

        $fitting = $user->fittings()->first();
        $this->assertSame(2, collect($fitting->items)->firstWhere('type_id', 3)['quantity']);
        $this->assertSame(5, collect($fitting->items)->firstWhere('type_id', 4)['quantity']);
    }

    public function test_store_uses_the_given_name(): void
    {
        $this->actingAs($this->makeUser())->postJson('/api/v1/fittings', ['eft' => self::EFT, 'name' => 'Renamed'])
            ->assertCreated()->assertJsonPath('data.name', 'Renamed');
    }

    public function test_store_validation_is_422(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user)->postJson('/api/v1/fittings', [])
            ->assertStatus(422)->assertJsonPath('code', 'validation_failed')->assertJsonValidationErrors(['eft']);
        $this->actingAs($user)->postJson('/api/v1/fittings', ['eft' => "[Nonexistent, X]\nDamage Control II\n"])
            ->assertStatus(422)->assertJsonValidationErrors(['eft']);
        $this->actingAs($user)->postJson('/api/v1/fittings', ['eft' => "[Typhoon, X]\n"])
            ->assertStatus(422)->assertJsonValidationErrors(['eft']);
        $this->assertSame(0, Fitting::count());
    }

    public function test_unknown_items_are_rejected_unless_ignored(): void
    {
        $user = $this->makeUser();
        $eft = self::EFT."Mystery Item\n";

        $this->actingAs($user)->postJson('/api/v1/fittings', ['eft' => $eft])
            ->assertStatus(422)->assertJsonValidationErrors(['eft']);
        $this->actingAs($user)->postJson('/api/v1/fittings', ['eft' => $eft, 'ignore_unmatched' => true])
            ->assertCreated()->assertJsonCount(3, 'data.items');
    }

    public function test_index_lists_only_your_fittings_and_show_returns_one(): void
    {
        $user = $this->makeUser();
        $mine = $this->fitting($user->id);
        $this->fitting($this->makeUser()->id, ['name' => 'Theirs']);

        $this->actingAs($user)->getJson('/api/v1/fittings')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $mine->id);
        $this->actingAs($user)->getJson("/api/v1/fittings/{$mine->id}")
            ->assertOk()->assertJsonStructure(['data' => self::RESOURCE_KEYS]);
    }

    public function test_update_renames_and_reimports(): void
    {
        $user = $this->makeUser();
        $fitting = $this->fitting($user->id);

        $this->actingAs($user)->putJson("/api/v1/fittings/{$fitting->id}", ['name' => 'New name'])
            ->assertOk()->assertJsonPath('data.name', 'New name')->assertJsonCount(1, 'data.items');

        $this->actingAs($user)->putJson("/api/v1/fittings/{$fitting->id}", ['eft' => self::EFT])
            ->assertOk()->assertJsonPath('data.name', 'New name')->assertJsonCount(3, 'data.items');
    }

    public function test_destroy_returns_204(): void
    {
        $user = $this->makeUser();
        $fitting = $this->fitting($user->id);

        $this->actingAs($user)->deleteJson("/api/v1/fittings/{$fitting->id}")->assertNoContent();
        $this->assertSame(0, Fitting::count());
    }

    public function test_other_users_fitting_is_404_not_found(): void
    {
        $fitting = $this->fitting($this->makeUser()->id);
        $stranger = $this->makeUser();

        $this->actingAs($stranger)->getJson("/api/v1/fittings/{$fitting->id}")->assertNotFound();
        $this->actingAs($stranger)->putJson("/api/v1/fittings/{$fitting->id}", ['name' => 'x'])->assertNotFound();
        $this->actingAs($stranger)->deleteJson("/api/v1/fittings/{$fitting->id}")->assertNotFound();
        $this->assertSame(1, Fitting::count());
    }
}
