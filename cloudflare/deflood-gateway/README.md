# DeFlood gateway Worker

This standalone Cloudflare Worker gives the DeFlood frontend a stable `workers.dev` URL while the Windows n8n host continues to use a changing Cloudflare Quick Tunnel URL.

Deployed gateway: `https://deflood-gateway.deflood-gateway.workers.dev`

## Routes

- `POST /webhook/evacuation-plan` proxies only to the matching n8n webhook.
- `POST /webhook/evacuation-chat` proxies only to the matching n8n webhook.
- `POST /admin/origin` validates and stores a new Quick Tunnel origin.
- `GET /health` reports whether a valid backend origin is configured without revealing it.

The `DEFLOOD_CONFIG` Workers KV binding stores the current origin under `n8n_origin`. `ADMIN_TOKEN` is a Wrangler secret and must never be placed in this repository or in the Vite frontend.

## Deployment

From this directory:

```powershell
pnpm install
pnpm exec wrangler login
pnpm run deploy
pnpm exec wrangler secret put ADMIN_TOKEN
```

Wrangler creates and binds the KV namespace declared in `wrangler.jsonc` during deployment. Use a long, randomly generated admin token and configure the identical value as `DEFLOOD_WORKER_ADMIN_TOKEN` on the Windows host.

## Windows startup

Run these from the repository root on the Windows n8n host.

Terminal 1:

```powershell
n8n
```

Terminal 2:

```powershell
$env:DEFLOOD_WORKER_URL = "https://deflood-gateway.deflood-gateway.workers.dev"
$env:DEFLOOD_WORKER_ADMIN_TOKEN = "<same value stored as the Worker ADMIN_TOKEN secret>"
.\scripts\windows\start-deflood-tunnel.ps1
```

The script keeps cloudflared attached to the terminal, prints its logs, and updates the Worker once after detecting the generated Quick Tunnel hostname.

## Local verification

```powershell
pnpm test
pnpm run typecheck
```
