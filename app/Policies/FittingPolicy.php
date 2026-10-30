<?php

namespace App\Policies;

use App\Models\Fitting;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * A user's own fittings. Anyone else gets 404.
 */
class FittingPolicy
{
    public function view(User $user, Fitting $fitting): Response
    {
        return $this->owns($user, $fitting);
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Fitting $fitting): Response
    {
        return $this->owns($user, $fitting);
    }

    public function delete(User $user, Fitting $fitting): Response
    {
        return $this->owns($user, $fitting);
    }

    private function owns(User $user, Fitting $fitting): Response
    {
        return $user->id === $fitting->user_id ? Response::allow() : Response::denyAsNotFound();
    }
}
