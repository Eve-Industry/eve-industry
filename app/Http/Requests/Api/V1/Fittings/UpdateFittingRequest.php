<?php

namespace App\Http\Requests\Api\V1\Fittings;

use App\Http\Requests\Api\V1\ApiRequest;

/**
 * Rename a fitting, or replace its contents with new EFT text.
 */
class UpdateFittingRequest extends ApiRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'eft' => 'sometimes|required|string|max:20000',
            'name' => 'sometimes|required|string|max:100',
            'ignore_unmatched' => 'boolean',
        ];
    }
}
