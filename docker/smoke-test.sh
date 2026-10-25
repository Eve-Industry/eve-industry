#!/usr/bin/env bash
# Post-deploy smoke test. Usage: docker/smoke-test.sh [BASE_URL]
#
# Checks that the web role answers and can reach its database and cache:
#   GET /up             Laravel's own health route, expects 200
#   GET /api/v1/health  JSON readiness (database + cache), expects 200 and
#                       "status":"ok"
#   GET /api/v1/me      expects 401 with "code":"unauthenticated" (the API
#                       routes and error envelope are wired up)
# Retries for up to SMOKE_TIMEOUT seconds (default 60) while the app starts.
# Exits non-zero on the first check that still fails, so a deploy pipeline
# can stop or roll back.
set -u

BASE_URL="${1:-${APP_URL:-http://localhost:8080}}"
BASE_URL="${BASE_URL%/}"
TIMEOUT="${SMOKE_TIMEOUT:-60}"

fail() {
    echo "SMOKE FAIL: $*" >&2
    exit 1
}

# check NAME PATH EXPECTED_STATUS [BODY_SUBSTRING]
check() {
    local name="$1" path="$2" want="$3" needle="${4:-}"
    local deadline=$((SECONDS + TIMEOUT))
    local status body

    while :; do
        body="$(curl -sS -H 'Accept: application/json' -w '\n%{http_code}' "${BASE_URL}${path}" 2>/dev/null)"
        status="${body##*$'\n'}"
        body="${body%$'\n'*}"

        if [ "$status" = "$want" ] && { [ -z "$needle" ] || [[ "$body" == *"$needle"* ]]; }; then
            echo "ok   ${name}: ${path} -> ${status}"
            return 0
        fi

        if [ "$SECONDS" -ge "$deadline" ]; then
            fail "${name}: ${path} returned ${status:-no response} (wanted ${want}${needle:+ containing ${needle}}): ${body:0:300}"
        fi
        sleep 2
    done
}

echo "Smoke testing ${BASE_URL}"
check "framework health" "/up" 200
check "api health" "/api/v1/health" 200 '"status":"ok"'
check "api auth" "/api/v1/me" 401 '"code":"unauthenticated"'
echo "Smoke test passed"
