#!/usr/bin/env bash
# Register (or re-register) the Telegram webhook to point at the deployed Worker.
#
# Usage:
#   TELEGRAM_TOKEN=xxx WEBHOOK_SECRET=yyy WORKER_URL=https://seyran-telegram-bot.<sub>.workers.dev ./set-webhook.sh
#
# Run once after `wrangler deploy` (and again only if the Worker URL changes).
set -euo pipefail

: "${TELEGRAM_TOKEN:?set TELEGRAM_TOKEN}"
: "${WORKER_URL:?set WORKER_URL (e.g. https://seyran-telegram-bot.<sub>.workers.dev)}"
: "${WEBHOOK_SECRET:?set WEBHOOK_SECRET (same value as the Worker secret)}"

echo "Setting webhook -> $WORKER_URL"
curl -s "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
  --data-urlencode "url=${WORKER_URL}" \
  --data-urlencode "secret_token=${WEBHOOK_SECRET}" \
  --data-urlencode "allowed_updates=[\"message\",\"channel_post\"]"
echo
echo "Current webhook info:"
curl -s "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getWebhookInfo"
echo
