<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A ship fitting shared by a corporation. Same shape as a personal Fitting.
 */
class CorporationFitting extends Model
{
    protected $fillable = [
        'corporation_id',
        'created_by_user_id',
        'name',
        'ship_type_id',
        'ship_type_name',
        'items',
        'raw_eft',
    ];

    protected function casts(): array
    {
        return [
            'corporation_id' => 'integer',
            'created_by_user_id' => 'integer',
            'ship_type_id' => 'integer',
            'items' => 'array',
        ];
    }

    public function createdByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
