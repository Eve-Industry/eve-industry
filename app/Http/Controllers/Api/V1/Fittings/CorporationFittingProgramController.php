<?php

namespace App\Http\Controllers\Api\V1\Fittings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Fittings\FittingBuildProgramRequest;
use App\Http\Requests\Api\V1\Fittings\FittingPlanRequest;
use App\Http\Resources\V1\Fittings\FittingPlanResource;
use App\Http\Resources\V1\Programs\CorporationBuildProgramResource;
use App\Http\Responses\ApiResponse;
use App\Services\Fittings\CorporationFittingProgramService;
use App\Services\Heavy\HeavyServiceException;
use App\Services\Programs\CorporationBuildProgramWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * The corporate fitting program: plan N ships of the corporation's fittings
 * against the corporation's assets, then build the shortfall as a corporate
 * build program.
 */
class CorporationFittingProgramController extends Controller
{
    public function __construct(
        private CorporationFittingProgramService $program,
        private CorporationBuildProgramWriter $writer,
    ) {}

    /**
     * Plan corporate fitted ships.
     *
     * Same result as the personal plan (anything inside a ship does not count
     * as available), but counting only the corporation's assets and blueprints (read with the enabling director's token). 404
     * when corporate build programs are not enabled for your corporation, 403
     * without a character there, 400 when the director character is gone,
     * 422 when a fitting is not your corporation's.
     *
     * @response array{data: array{plan: FittingPlanResource, character_name: string}, meta: object}
     */
    public function plan(FittingPlanRequest $request): JsonResponse
    {
        try {
            $config = $this->program->configFor($request->user());
            $result = $this->program->plan($config, $request->selections(), $request->locationIds(), $request->includeHull(), $request->countFittedShips());
        } catch (HeavyServiceException $e) {
            abort($e->status, $e->getMessage());
        }

        return ApiResponse::success([
            'plan' => (new FittingPlanResource($result['plan']))->resolve(),
            'character_name' => $result['character_name'],
        ]);
    }

    /**
     * Create a corporate build program for the shortfall.
     *
     * Needs the same role as creating any corporate build program (403
     * otherwise). 422 when nothing needs building. Returns 201.
     *
     * @response array{data: CorporationBuildProgramResource, meta: object}
     */
    public function buildProgram(FittingBuildProgramRequest $request): JsonResponse
    {
        try {
            $config = $this->program->configFor($request->user());
            $result = $this->program->plan($config, $request->selections(), $request->locationIds(), $request->includeHull(), $request->countFittedShips());
        } catch (HeavyServiceException $e) {
            abort($e->status, $e->getMessage());
        }

        $steps = $this->program->buildSteps($result['plan'], $request->typeIds(), $request->meLevel());
        if ($steps === []) {
            throw ValidationException::withMessages(['type_ids' => 'Nothing to build: no missing item has a manufacturing blueprint.']);
        }

        $program = $this->writer->create($config->corporation_id, $request->user(), [
            'name' => $request->validated('name'),
            't2_type_id' => null,
            't2_type_name' => null,
            'steps' => $steps,
            'settings' => ['me' => $request->meLevel()],
        ])->refresh();

        return ApiResponse::success(new CorporationBuildProgramResource($program), status: 201);
    }
}
