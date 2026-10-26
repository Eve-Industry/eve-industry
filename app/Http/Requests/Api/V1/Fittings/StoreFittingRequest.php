<?php

namespace App\Http\Requests\Api\V1\Fittings;

use App\Http\Requests\Api\V1\ApiRequest;

/**
 * Save a fitting from pasted EFT text (also used for corporate fittings).
 */
class StoreFittingRequest extends ApiRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            /** The EFT export, starting with the `[Ship, Fit name]` line. */
            'eft' => 'required|string|max:20000',
            /** Defaults to the fit name in the EFT header. */
            'name' => 'nullable|string|max:100',
            /** Save even when some item names are not recognised (they are dropped). */
            'ignore_unmatched' => 'boolean',
        ];
    }
}
