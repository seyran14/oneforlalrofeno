# Telegram bot on Cloudflare Workers (24/7, free)

Webhook version of the photo-upload bot. Runs serverless on Cloudflare's free
plan (100k requests/day, no sleeping). Same behaviour as the local `bot.js`:
send a photo with a caption → it's committed to `public/images/` and you get the
`https://seyran.cc/images/<caption>.jpg` URL back.

## One-time deploy

All commands are run from **this folder** (`bot-worker/`).

```bash
cd bot-worker

# 1. Log in to Cloudflare (opens a browser)
npx wrangler login

# 2. Store the secrets (paste each value when prompted)
npx wrangler secret put TELEGRAM_TOKEN     # your Telegram bot token
npx wrangler secret put GITHUB_TOKEN       # GitHub token with repo write access
npx wrangler secret put WEBHOOK_SECRET     # any random string, e.g. `openssl rand -hex 16`

# 3. Deploy — prints the Worker URL, e.g.
#    https://seyran-telegram-bot.<your-subdomain>.workers.dev
npx wrangler deploy

# 4. Point Telegram at the Worker (use the URL from step 3 and the same secret)
TELEGRAM_TOKEN=<token> \
WEBHOOK_SECRET=<secret> \
WORKER_URL=https://seyran-telegram-bot.<your-subdomain>.workers.dev \
  ./set-webhook.sh
```

Done — the bot is live 24/7. Send it a photo with a caption to test.

## Updating the code later

```bash
cd bot-worker
npx wrangler deploy
```

Secrets and the webhook stay as they are; no need to redo steps 2 and 4.

## Notes / troubleshooting

- **Switching back to local polling?** The webhook and polling are mutually
  exclusive. Remove the webhook first:
  `curl https://api.telegram.org/bot<token>/deleteWebhook` — then `node ../bot.js`.
- **Check status:** `curl https://api.telegram.org/bot<token>/getWebhookInfo`
  (look at `last_error_message`).
- **Live logs:** `npx wrangler tail`
- The `WEBHOOK_SECRET` makes the Worker reject any POST that isn't from Telegram.
