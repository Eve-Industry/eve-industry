<?php

namespace App\Http\Requests\Api\V1\Fittings;

use App\Http\Requests\Api\V1\ApiRequest;

/**
 * Preview how EFT text parses, without saving.
 */
class ParseFittingRequest extends ApiRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'eft' => 'required|string|max:20000',
        ];
    }
}
