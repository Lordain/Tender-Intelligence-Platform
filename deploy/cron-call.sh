#!/usr/bin/env bash
# Calls one /api/cron/* route on the local server with the CRON_SECRET bearer,
# the way Vercel's cron did. Used by deploy/crontab:
#
#   cron-call.sh /api/cron/revalidate-tenders
set -euo pipefail

ENV_FILE=/srv/latintender/shared/.env
LOG=/srv/latintender/logs/cron.log
path="$1"

secret="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
if [ -z "$secret" ]; then echo "$(date -u +%FT%TZ) $path 跳过：.env 里没有 CRON_SECRET" >> "$LOG"; exit 1; fi

# curl prints 000 itself when it cannot connect; `|| true` only keeps set -e
# from exiting (it used to append a second 000 and log "HTTP 000000").
status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 900 \
  -H "Authorization: Bearer $secret" \
  -H "Host: latintender.com" -H "X-Forwarded-Proto: https" \
  "http://127.0.0.1:3000$path" 2>/dev/null)" || true
status="${status:-000}"
echo "$(date -u +%FT%TZ) $path HTTP $status" >> "$LOG"
[ "$status" -ge 200 ] && [ "$status" -lt 300 ]
