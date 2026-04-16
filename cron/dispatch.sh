#!/bin/sh
# Fires the dispatch cron endpoint.
CRON_SECRET="${CRON_SECRET:?CRON_SECRET env var required}"
APP_URL="${APP_URL:-https://app.guerrillasuite.com}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Firing dispatch cron against ${APP_URL}..."

HTTP_STATUS=$(curl -s -o /tmp/cron_body.txt -w "%{http_code}" \
  -X POST "${APP_URL}/api/cron/dispatch" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 310) || true

BODY=$(cat /tmp/cron_body.txt 2>/dev/null || echo "(no body)")

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] HTTP ${HTTP_STATUS} — ${BODY}"

if [ "$HTTP_STATUS" = "200" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] OK"
  exit 0
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: unexpected status ${HTTP_STATUS}" >&2
  exit 1
fi
