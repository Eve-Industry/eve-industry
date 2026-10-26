<?php

use App\Http\Controllers\Api\V1\Fittings\CorporationFittingController;
use App\Http\Controllers\Api\V1\Fittings\CorporationFittingProgramController;
use App\Http\Controllers\Api\V1\Fittings\FittingController;
use App\Http\Controllers\Api\V1\Fittings\FittingProgramController;
use App\Models\BuildProgram;
use App\Models\CorporationBuildProgram;
use App\Models\CorporationFitting;
use App\Models\Fitting;
use Illuminate\Support\Facades\Route;

/*
| /api/v1 routes for fittings and the fitting program.
| Required from routes/api.php inside the auth:sanctum group, with the
| api.v1. name prefix already applied.
|
| Personal and corporate fittings are separate: personal ones only ever see
| the user's own assets, corporate ones only the corporation's. Ownership and
| role checks are model policies (FittingPolicy, CorporationFittingPolicy)
| used through `can:` middleware.
*/

Route::name('fittings.')->group(function () {
    // Personal fittings
    Route::get('/fittings', [FittingController::class, 'index'])->name('index');
    Route::post('/fittings/parse', [FittingController::class, 'parse'])->name('parse');
    Route::post('/fittings', [FittingController::class, 'store'])
        ->middleware('can:create,'.Fitting::class)
        ->name('store');
    Route::get('/fittings/{fitting}', [FittingController::class, 'show'])
        ->middleware('can:view,fitting')
        ->name('show');
    Route::put('/fittings/{fitting}', [FittingController::class, 'update'])
        ->middleware('can:update,fitting')
        ->name('update');
    Route::delete('/fittings/{fitting}', [FittingController::class, 'destroy'])
        ->middleware('can:delete,fitting')
        ->name('destroy');

    Route::post('/fitting-program/plan', [FittingProgramController::class, 'plan'])->name('program.plan');
    Route::post('/fitting-program/build-program', [FittingProgramController::class, 'buildProgram'])
        ->middleware('can:create,'.BuildProgram::class)
        ->name('program.build-program');

    // Corporate fittings
    Route::get('/corporation/fittings', [CorporationFittingController::class, 'index'])->name('corporation.index');
    Route::post('/corporation/fittings/parse', [FittingController::class, 'parse'])->name('corporation.parse');
    Route::post('/corporation/fittings', [CorporationFittingController::class, 'store'])
        ->middleware('can:create,'.CorporationFitting::class)
        ->name('corporation.store');
    Route::get('/corporation/fittings/{fitting}', [CorporationFittingController::class, 'show'])
        ->middleware('can:view,fitting')
        ->name('corporation.show');
    Route::put('/corporation/fittings/{fitting}', [CorporationFittingController::class, 'update'])
        ->middleware('can:update,fitting')
        ->name('corporation.update');
    Route::delete('/corporation/fittings/{fitting}', [CorporationFittingController::class, 'destroy'])
        ->middleware('can:delete,fitting')
        ->name('corporation.destroy');

    Route::post('/corporation/fitting-program/plan', [CorporationFittingProgramController::class, 'plan'])->name('corporation.program.plan');
    Route::post('/corporation/fitting-program/build-program', [CorporationFittingProgramController::class, 'buildProgram'])
        ->middleware('can:create,'.CorporationBuildProgram::class)
        ->name('corporation.program.build-program');
});
