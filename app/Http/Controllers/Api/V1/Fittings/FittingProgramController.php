<?php

namespace App\Http\Controllers\Api\V1\Fittings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Fittings\FittingBuildProgramRequest;
use App\Http\Requests\Api\V1\Fittings\FittingPlanRequest;
use App\Http\Resources\V1\Programs\BuildProgramResource;
use App\Http\Responses\ApiResponse;
use App\Services\Fittings\FittingProgramService;
use App\Services\Programs\BuildProgramWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * The personal fitting program: plan N ships of your fittings against your
 * own characters' assets, then build the shortfall.
 */
class FittingProgramController extends Controller
{
    public function __construct(
        private FittingProgramService $program,
        private BuildProgramWriter $writer,
    ) {}

    /**
     * Plan fitted ships.
     *
     * For each item the fittings need: how many are required, how many your
     * characters hold (their own assets only, not the corporation's; items
     * fitted to ships do not count), what is missing and whether a
     * manufacturing blueprint exists (`buildable`) and you own it.
     * `ships_fittable` is how many ships of a fitting your stock could fit.
     * 422 when a fitting is not yours.
     *
     * @response array{data: array{fittings: list<array{fitting_id: int, name: string, ship_type_id: int, ship_type_name: string, ships: int, ships_fittable: int}>, items: list<array{type_id: int, name: string, kind: string, required: int, on_hand: int, missing: int, buildable: bool, blueprint_type_id: int|null, blueprint_owned: bool}>, summary: array{item_types: int, missing_types: int, complete: bool}}, meta: array<string, mixed>}
     */
    public function plan(FittingPlanRequest $request): JsonResponse
    {
        $result = $this->program->plan($request->user(), $request->selections(), $request->locationIds(), $request->includeHull());

        return ApiResponse::success($result['plan'], $result['assets']);
    }

    /**
     * Create a build program for the shortfall.
     *
     * Plans the same way as `plan`, then builds the missing items that have a
     * manufacturing blueprint (all of them, or only `type_ids`). 422 when
     * nothing needs building. Returns 201.
     *
     * @response array{data: BuildProgramResource, meta: object}
     */
    public function buildProgram(FittingBuildProgramRequest $request): JsonResponse
    {
        $result = $this->program->plan($request->user(), $request->selections(), $request->locationIds(), $request->includeHull());
        $steps = $this->program->buildSteps($result['plan'], $request->typeIds(), $request->meLevel());

        if ($steps === []) {
            throw ValidationException::withMessages(['type_ids' => 'Nothing to build: no missing item has a manufacturing blueprint.']);
        }

        $program = $this->writer->create($request->user(), [
            'name' => $request->validated('name'),
            't2_type_id' => null,
            't2_type_name' => null,
            'steps' => $steps,
            'settings' => ['me' => $request->meLevel()],
        ])->refresh();

        return ApiResponse::success(new BuildProgramResource($program), status: 201);
    }
}
