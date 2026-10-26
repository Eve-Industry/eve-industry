<?php

namespace App\Policies;

use App\Models\CorporationFitting;
use App\Models\User;
use App\Services\CorporationBuildProgramService;
use Illuminate\Auth\Access\Response;

/**
 * Corporate fittings share the access rules of corporate build programs.
 *
 * Abilities: view, create, update, delete.
 *
 * - view: the corporation has the feature enabled, it is the fitting's
 *   corporation and the user has a character there (404 if not).
 * - create: the user's corporation has the feature enabled and the user is a
 *   Director/CEO or Factory Manager there (403).
 * - update/delete: the same for the fitting's corporation (404 if not).
 */
class CorporationFittingPolicy
{
    public function __construct(private CorporationBuildProgramService $service) {}

    public function view(User $user, CorporationFitting $fitting): Response
    {
        $config = $this->service->getConfigForUser($user->id);
        if (! $config || $config->corporation_id !== $fitting->corporation_id) {
            return Response::denyAsNotFound();
        }

        return $this->service->canUserView($user, $fitting->corporation_id)
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    public function create(User $user): Response
    {
        $config = $this->service->getConfigForUser($user->id);
        if (! $config) {
            return Response::deny('Corporate build programs not enabled');
        }

        return $this->service->canUserManage($user, $config->corporation_id)
            ? Response::allow()
            : Response::deny('Insufficient role. Director, CEO, or Factory Manager required.');
    }

    public function update(User $user, CorporationFitting $fitting): Response
    {
        return $this->manages($user, $fitting);
    }

    public function delete(User $user, CorporationFitting $fitting): Response
    {
        return $this->manages($user, $fitting);
    }

    private function manages(User $user, CorporationFitting $fitting): Response
    {
        $config = $this->service->getConfigForUser($user->id);
        if (! $config || $config->corporation_id !== $fitting->corporation_id) {
            return Response::denyAsNotFound();
        }

        return $this->service->canUserManage($user, $fitting->corporation_id)
            ? Response::allow()
            : Response::denyAsNotFound();
    }
}
