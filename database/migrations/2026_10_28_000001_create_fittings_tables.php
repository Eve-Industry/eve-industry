<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fittings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->unsignedBigInteger('ship_type_id');
            $table->string('ship_type_name');
            $table->json('items');
            $table->text('raw_eft')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'updated_at']);
        });

        Schema::create('corporation_fittings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('corporation_id');
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 100);
            $table->unsignedBigInteger('ship_type_id');
            $table->string('ship_type_name');
            $table->json('items');
            $table->text('raw_eft')->nullable();
            $table->timestamps();

            $table->index(['corporation_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('corporation_fittings');
        Schema::dropIfExists('fittings');
    }
};
