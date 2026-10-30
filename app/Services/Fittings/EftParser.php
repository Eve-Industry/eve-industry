<?php

namespace App\Services\Fittings;

use App\Models\EveType;

/**
 * Parses an EFT fitting export ("[Ship, Fit name]" then modules, charges,
 * drones and cargo) into type ids and quantities.
 *
 * Items are aggregated by type. Names that are not in eve_types are returned
 * in `unmatched` rather than failing the parse; an unknown hull leaves `ship`
 * null.
 */
class EftParser
{
    /**
     * @return array{
     *     ship: array{type_id: int, name: string}|null,
     *     name: string|null,
     *     items: list<array{type_id: int, name: string, quantity: int, section: string}>,
     *     unmatched: list<string>
     * }
     */
    public function parse(string $eft): array
    {
        $lines = preg_split('/\r?\n/', trim($eft)) ?: [];

        $shipName = null;
        $fitName = null;
        $sections = [[]];
        $headerSeen = false;

        foreach ($lines as $line) {
            $line = trim($line);

            if (preg_match('/^\[([^\],]+),\s*(.*)\]$/', $line, $m)) {
                // The first header is the fit; a repeated trailing header is ignored.
                if (! $headerSeen) {
                    $headerSeen = true;
                    $shipName = trim($m[1]);
                    $fitName = trim($m[2]);
                }

                continue;
            }

            if ($line === '') {
                if ($sections[array_key_last($sections)] !== []) {
                    $sections[] = [];
                }

                continue;
            }

            if (! $headerSeen || preg_match('/^\[Empty .*slot\]$/i', $line)) {
                continue;
            }

            $sections[array_key_last($sections)][] = $line;
        }

        $entries = [];
        $candidates = $shipName === null ? [] : [$shipName];
        foreach ($sections as $index => $sectionLines) {
            // EFT lists low, mid, high and rig groups first; drones and cargo follow.
            $section = $index < 4 ? 'fitted' : 'cargo';
            foreach ($sectionLines as $line) {
                $line = preg_replace('/\s+\/OFFLINE$/i', '', $line);
                $quantity = 1;
                if (preg_match('/^(.*\S)\s+x(\d+)$/i', $line, $m)) {
                    $line = $m[1];
                    $quantity = max(1, (int) $m[2]);
                }

                // "Module, Charge" lines hold two types; the whole line is tried first.
                $candidates[] = $line;
                if (str_contains($line, ',')) {
                    array_push($candidates, ...array_map('trim', explode(',', $line)));
                }
                $entries[] = ['line' => $line, 'quantity' => $quantity, 'section' => $section];
            }
        }

        $types = $this->resolve($candidates);

        $items = [];
        $unmatched = [];
        foreach ($entries as $entry) {
            $line = $entry['line'];
            // Try the whole line first; names may legitimately contain a comma.
            $names = isset($types[mb_strtolower($line)])
                ? [$line]
                : array_map('trim', explode(',', $line));

            foreach ($names as $name) {
                $type = $types[mb_strtolower($name)] ?? null;
                if ($type === null) {
                    $unmatched[$name] = $name;

                    continue;
                }

                $key = $type['type_id'];
                if (isset($items[$key])) {
                    $items[$key]['quantity'] += $entry['quantity'];
                } else {
                    $items[$key] = [
                        'type_id' => $type['type_id'],
                        'name' => $type['name'],
                        'quantity' => $entry['quantity'],
                        'section' => $entry['section'],
                    ];
                }
            }
        }

        $ship = $shipName === null ? null : ($types[mb_strtolower($shipName)] ?? null);

        return [
            'ship' => $ship,
            'name' => $fitName,
            'items' => array_values($items),
            'unmatched' => array_values($unmatched),
        ];
    }

    /**
     * Resolve names to types, case-insensitively.
     *
     * @param  list<string>  $names
     * @return array<string, array{type_id: int, name: string}> keyed by lowercased name
     */
    private function resolve(array $names): array
    {
        $names = array_values(array_unique(array_filter($names, fn ($n) => $n !== '')));
        if ($names === []) {
            return [];
        }

        $found = [];
        $add = function ($rows) use (&$found) {
            foreach ($rows as $row) {
                $found[mb_strtolower($row->name)] ??= ['type_id' => (int) $row->type_id, 'name' => $row->name];
            }
        };

        // Exact match uses the name index; only the leftovers need a LOWER() scan.
        $add(EveType::whereIn('name', $names)->get(['type_id', 'name']));

        $missing = array_values(array_filter($names, fn ($n) => ! isset($found[mb_strtolower($n)])));
        if ($missing !== []) {
            $lowered = array_map('mb_strtolower', $missing);
            $placeholders = implode(',', array_fill(0, count($lowered), '?'));
            $add(EveType::whereRaw("LOWER(name) IN ({$placeholders})", $lowered)->get(['type_id', 'name']));
        }

        return $found;
    }
}
