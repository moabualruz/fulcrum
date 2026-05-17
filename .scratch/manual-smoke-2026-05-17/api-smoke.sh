#!/bin/bash
# API endpoint smoke. Each endpoint: GET with 5s timeout. Writes JSON log.
set -u
BASE="${1:-http://127.0.0.1:3000}"
TS=$(date +%Y%m%d-%H%M%S)
OUT=".scratch/manual-smoke-2026-05-17/logs/api-workflow-endpoints-smoke-${TS}.json"
mkdir -p "$(dirname "$OUT")"

ENDPOINTS=(
  "/openapi-json"
  "/api/v1/doctor"
  "/api/v1/doctor/subsystems"
  "/api/v1/organizations/members"
  "/api/v1/docs"
  "/api/v1/artifacts"
  "/api/v1/audit"
  "/api/v1/auth/whoami"
  "/api/v1/settings"
  "/api/v1/feature-flags"
  "/api/v1/skills"
  "/api/v1/inference/health"
  "/api/v1/credentials"
  "/api/v1/error-logs"
  "/api/v1/telemetry/status"
  "/api/v1/notifications/settings"
  "/api/v1/notifications"
  "/api/v1/projects"
  "/api/v1/tasks"
)

ITEMS=()
for p in "${ENDPOINTS[@]}"; do
  resp=$(curl -sS --max-time 5 -o /tmp/.fulcrum-resp -w '%{http_code}|%{time_total}' "${BASE}${p}" 2>&1) || resp="000|timeout"
  code="${resp%%|*}"
  t="${resp##*|}"
  if [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 400 ]; then ok=true; else ok=false; fi
  body_preview=$(head -c 200 /tmp/.fulcrum-resp 2>/dev/null | tr -d '\n' | sed 's/"/\\"/g')
  ITEMS+=("{\"path\":\"$p\",\"status\":$code,\"ok\":$ok,\"time_total\":\"$t\",\"body_preview\":\"$body_preview\"}")
  echo "$p -> $code ($t s)"
done

joined=$(IFS=,; echo "${ITEMS[*]}")
printf '{"timestamp":"%s","baseUrl":"%s","results":[%s]}\n' "$TS" "$BASE" "$joined" | jq . > "$OUT"
echo "wrote $OUT"
