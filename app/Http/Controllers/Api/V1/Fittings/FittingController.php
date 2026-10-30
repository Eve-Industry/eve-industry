<?php

namespace App\Http\Controllers\Api\V1\Fittings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Fittings\ParseFittingRequest;
use App\Http\Requests\Api\V1\Fittings\StoreFittingRequest;
use App\Http\Requests\Api\V1\Fittings\UpdateFittingRequest;
use App\Http\Resources\V1\Fittings\FittingResource;
use App\Http\Responses\ApiResponse;
use App\Models\Fitting;
use App\Services\Fittings\EftParser;
use App\Services\Fittings\FittingWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Your own ship fittings (My Fittings). Other users' fittings are 404.
 */
class FittingController extends Controller
{
    public function __construct(private FittingWriter $fittings) {}

    /**
     * Your fittings.
     *
     * Newest change first, with the hull and every item.
     *
     * @response array{data: list<FittingResource>, meta: object}
     */
    public function index(Request $request): JsonResponse
    {
        $fittings = $request->user()->fittings()->orderByDesc('updated_at')->orderByDesc('id')->get();

        return ApiResponse::success(FittingResource::collection($fittings));
    }

    /**
     * A fitting.
     *
     * @response array{data: FittingResource, meta: object}
     */
    public function show(Fitting $fitting): JsonResponse
    {
        return ApiResponse::success(new FittingResource($fitting));
    }

    /**
     * Preview pasted EFT text without saving.
     *
     * Items are aggregated by type. `ship` is null when the hull is not
     * recognised and `unmatched` lists item names that are not.
     *
     * @response array{data: array{ship: array{type_id: int, name: string}|null, name: string|null, items: list<array{type_id: int, name: string, quantity: int, section: string}>, unmatched: list<string>}, meta: object}
     */
    public function parse(ParseFittingRequest $request, EftParser $parser): JsonResponse
    {
        return ApiResponse::success($parser->parse($request->validated('eft')));
    }

    /**
     * Save a fitting from EFT text.
     *
     * 422 on `eft` for an unknown hull, no items, or unknown item names
     * unless `ignore_unmatched` is set. Returns 201.
     *
     * @response array{data: FittingResource, meta: object}
     */
    public function store(StoreFittingRequest $request): JsonResponse
    {
        $fitting = $this->fittings->create(
            $request->user(),
            $request->validated('eft'),
            $request->validated('name'),
            (bool) $request->validated('ignore_unmatched'),
        );

        return ApiResponse::success(new FittingResource($fitting), status: 201);
    }

    /**
     * Rename a fitting, or replace its contents with new EFT text.
     *
     * @response array{data: FittingResource, meta: object}
     */
    public function update(UpdateFittingRequest $request, Fitting $fitting): JsonResponse
    {
        $fitting = $this->fittings->update(
            $fitting,
            $request->validated('eft'),
            $request->validated('name'),
            (bool) $request->validated('ignore_unmatched'),
        );

        return ApiResponse::success(new FittingResource($fitting));
    }

    /**
     * Delete a fitting.
     */
    public function destroy(Fitting $fitting): Response
    {
        $this->fittings->delete($fitting);

        return response()->noContent();
    }
}
