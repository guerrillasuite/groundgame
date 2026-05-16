#!/bin/sh
# Fires cron endpoints: dispatch + automations
CRON_SECRET="${CRON_SECRET:?CRON_SECRET env var required}"
APP_URL="${APP_URL:-https://app.guerrillasuite.com}"

call_cron() {
  ENDPOINT="$1"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Firing ${ENDPOINT}..."
  HTTP_STATUS=$(curl -s -o /tmp/cron_body.txt -w "%{http_code}" \
    -X POST "${APP_URL}${ENDPOINT}" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    --max-time 310) || true
  BODY=$(cat /tmp/cron_body.txt 2>/dev/null || echo "(no body)")
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ${ENDPOINT} -> HTTP ${HTTP_STATUS} -- ${BODY}"
  if [ "$HTTP_STATUS" != "200" ]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: ${ENDPOINT} returned ${HTTP_STATUS}" >&2
    return 1
  fi
  return 0
}

FAIL=0
call_cron "/api/cron/dispatch"    || FAIL=1
call_cron "/api/cron/automations" || FAIL=1

exit $FAIL
