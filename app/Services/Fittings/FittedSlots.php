<?php

namespace App\Services\Fittings;

/**
 * ESI asset location_flag values of modules, rigs and subsystems fitted to a
 * ship. Such items are part of a ship, not stock a fitting could draw on.
 */
final class FittedSlots
{
    public const FLAGS = [
        'HiSlot0', 'HiSlot1', 'HiSlot2', 'HiSlot3', 'HiSlot4', 'HiSlot5', 'HiSlot6', 'HiSlot7',
        'MedSlot0', 'MedSlot1', 'MedSlot2', 'MedSlot3', 'MedSlot4', 'MedSlot5', 'MedSlot6', 'MedSlot7',
        'LoSlot0', 'LoSlot1', 'LoSlot2', 'LoSlot3', 'LoSlot4', 'LoSlot5', 'LoSlot6', 'LoSlot7',
        'RigSlot0', 'RigSlot1', 'RigSlot2', 'SubSystemSlot0', 'SubSystemSlot1', 'SubSystemSlot2',
        'SubSystemSlot3', 'SubSystemSlot4',
    ];
}
