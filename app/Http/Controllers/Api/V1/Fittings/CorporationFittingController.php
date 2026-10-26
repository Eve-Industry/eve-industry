<?php

namespace App\Http\Controllers\Api\V1\Fittings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Fittings\StoreFittingRequest;
use App\Http\Requests\Api\V1\Fittings\UpdateFittingRequest;
use App\Http\Resources\V1\Fittings\CorporationFittingResource;
use App\Http\Responses\ApiResponse;
use App\Models\CorporationFitting;
use App\Models\User;
use App\Services\CorporationBuildProgramService;
use App\Services\Fittings\CorporationFittingWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Corporate ship fittings. They follow the corporate build program rules:
 * the feature must be enabled for your corporation, anyone with a character
 * there may view, and creating, changing or deleting needs a Director, CEO or
 * Factory Manager character.
 */
class CorporationFittingController extends Controller
{
    public function __construct(
        private CorporationFittingWriter $fittings,
        private CorporationBuildProgramService $service,
    ) {}

    /**
     * Corporate fittings.
     *
     * Whether corporate build programs are enabled for your corporation, what
     * you may do and the fittings, newest change first. Never 403, so the page
     * can explain why it is empty.
     *
     * @response array{data: array{enabled: bool, can_view: bool, can_manage: bool, corporation_name: string|null, fittings: list<CorporationFittingResource>}, meta: object}
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $config = $this->service->getConfigForUser($user->id);

        $canView = $config !== null && $this->service->canUserView($user, $config->corporation_id);
        $canManage = $config !== null && $this->service->canUserManage($user, $config->corporation_id);
        $fittings = $canView
            ? CorporationFitting::where('corporation_id', $config->corporation_id)->orderByDesc('updated_at')->orderByDesc('id')->get()
            : collect();

        return ApiResponse::success([
            'enabled' => $config !== null,
            'can_view' => $canView,
            'can_manage' => $canManage,
            'corporation_name' => $config?->corporation_name,
            'fittings' => CorporationFittingResource::collection($fittings)->resolve($request),
        ]);
    }

    /**
     * A corporate fitting.
     *
     * Another corporation's fitting is 404, as is any when the feature is not
     * enabled for yours.
     *
     * @response array{data: CorporationFittingResource, meta: object}
     */
    public function show(CorporationFitting $fitting): JsonResponse
    {
        return ApiResponse::success(new CorporationFittingResource($fitting));
    }

    /**
     * Save a corporate fitting from EFT text.
     *
     * Needs the feature enabled and a Director, CEO or Factory Manager
     * character (403 otherwise). 422 as for personal fittings. Returns 201.
     *
     * @response array{data: CorporationFittingResource, meta: object}
     */
    public function store(StoreFittingRequest $request): JsonResponse
    {
        $fitting = $this->fittings->create(
            $this->corporationId($request->user()),
            $request->user(),
            $request->validated('eft'),
            $request->validated('name'),
            (bool) $request->validated('ignore_unmatched'),
        );

        return ApiResponse::success(new CorporationFittingResource($fitting), status: 201);
    }

    /**
     * Rename a corporate fitting, or replace its contents with new EFT text.
     *
     * @response array{data: CorporationFittingResource, meta: object}
     */
    public function update(UpdateFittingRequest $request, CorporationFitting $fitting): JsonResponse
    {
        $fitting = $this->fittings->update(
            $fitting,
            $request->validated('eft'),
            $request->validated('name'),
            (bool) $request->validated('ignore_unmatched'),
        );

        return ApiResponse::success(new CorporationFittingResource($fitting));
    }

    /**
     * Delete a corporate fitting.
     */
    public function destroy(CorporationFitting $fitting): Response
    {
        $this->fittings->delete($fitting);

        return response()->noContent();
    }

    /**
     * The corporation the user manages fittings for; the create policy has
     * already checked that it exists.
     */
    private function corporationId(User $user): int
    {
        return $this->service->getConfigForUser($user->id)->corporation_id;
    }
}
