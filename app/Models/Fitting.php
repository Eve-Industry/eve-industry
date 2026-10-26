<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A personal ship fitting: the hull plus every module, charge, drone and cargo
 * item, aggregated by type in `items`.
 */
class Fitting extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'ship_type_id',
        'ship_type_name',
        'items',
        'raw_eft',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'ship_type_id' => 'integer',
            'items' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
