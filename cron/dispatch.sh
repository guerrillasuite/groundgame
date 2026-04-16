#!/bin/sh
# Fires the dispatch cron endpoint.
# Railway runs this on a schedule via the cron service start command:
#   sh /app/dispatch.sh
set -e

CRON_SECRET="${CRON_SECRET:?CRON_SECRET env var required}"
APP_URL="${APP_URL:-https://app.guerrillasuite.com}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Firing dispatch cron..."

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "${APP_URL}/api/cron/dispatch" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 310)

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS:")

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Status: ${HTTP_STATUS} — ${BODY}"

if [ "$HTTP_STATUS" != "200" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: dispatch cron returned ${HTTP_STATUS}" >&2
  exit 1
fi
