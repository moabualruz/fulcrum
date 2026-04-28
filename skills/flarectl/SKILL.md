---
name: flarectl
description: Use this skill whenever the user wants to manage Cloudflare DNS, zones, or cache from the command line — listing or creating DNS records, toggling the proxy flag, looking up zone status, purging the edge cache, inviting users, or scripting against the Cloudflare API without hand-rolling curl. Trigger phrases include "manage cloudflare DNS records from the cli", "create an A record on cloudflare", "list all DNS records for a zone", "update a cloudflare zone setting", "purge cloudflare cache", "check cloudflare zone status", "add a CNAME on cloudflare", "set proxied flag on a record". Reach for this over `curl https://api.cloudflare.com/...` for one-off DNS/zone work — flarectl carries auth, paging, and JSON shape. Skip for Workers / Pages deployment (use `wrangler`), for non-Cloudflare DNS (Route 53 → `aws`, Hetzner → `hcloud`), and for domain registration (use the dashboard or registrar API).
---

# flarectl

## When to use

- User want inspect/mutate Cloudflare DNS — list records, create A/CNAME/MX, flip proxied flag, change TTL, delete stale entry.
- User ask zone state — pending nameservers, plan, status, settings — for domain on Cloudflare.
- User want purge Cloudflare edge cache, by URL or wholesale, after deploy.
- Agent about to script against `api.cloudflare.com` for DNS/zone CRUD — `flarectl` handle auth, paging, JSON without bespoke curl.
- User want `--json` output to pipe into `jq` for filtering.

**Skip** for: Workers / Pages / KV / R2 / D1 / Queues — that `wrangler` (different scope, supported tool for compute). Domain registration. Non-Cloudflare DNS providers (`aws route53`, `hcloud dns`, `gcloud dns`). In-app SDK calls from Go/TS source — use `cloudflare-go` / `cloudflare-typescript` direct.

## Invocation

```bash
# Auth (preferred): scoped API token
export CF_API_TOKEN='<scoped-token>'

# Auth (legacy, account-wide — avoid)
export CF_API_KEY='<global-key>'
export CF_API_EMAIL='you@example.com'

# Sanity check — lists zones the token can see
flarectl zone list

# JSON for piping into jq
flarectl --json dns list --zone example.com | jq '.[] | select(.Type=="A")'
```

Exit codes: `0` success, `1` error. API error message land on stderr — capture for diagnostics (`2> err.log` or `2>&1`).

## Patterns

### Pattern A — zones

```bash
flarectl zone list                                  # all zones the token can see
flarectl zone info   --zone example.com             # plan, status, nameservers
flarectl zone create --zone example.com             # add a zone (you still have to point NS)
flarectl zone delete --zone example.com             # destructive — confirm twice
flarectl zone settings --zone example.com           # SSL mode, min TLS, brotli, etc.
```

Zone status `pending` mean Cloudflare not yet seen registrar's nameserver delegation — `zone info` is source of truth.

### Pattern B — DNS records (CRUD)

```bash
# List
flarectl dns list --zone example.com
flarectl dns list --zone example.com --type A
flarectl --json dns list --zone example.com | jq -r '.[] | "\(.ID)\t\(.Name)\t\(.Type)\t\(.Content)"'

# Create — always set --ttl explicitly for staging / short-lived records
flarectl dns create --zone example.com \
  --name www --type A --content 1.2.3.4 \
  --ttl 300 --proxy=true

# Update — needs the record ID from `dns list`
flarectl dns update --zone example.com \
  --id 1a2b3c4d5e... --content 5.6.7.8 --proxy=false

# Delete
flarectl dns delete --zone example.com --id 1a2b3c4d5e...
```

`--proxy=true` route through Cloudflare (orange cloud); `--proxy=false` is DNS-only (grey cloud). MX, SRV, raw-TCP, most mail records **must** be DNS-only.

### Pattern C — JSON output for scripts

```bash
# Find every proxied A record
flarectl --json dns list --zone example.com \
  | jq '.[] | select(.Type=="A" and .Proxied==true) | {name: .Name, ip: .Content}'

# Pipe IDs into a delete loop (be careful — destructive)
flarectl --json dns list --zone staging.example.com \
  | jq -r '.[] | select(.Name | startswith("preview-")) | .ID' \
  | xargs -I{} flarectl dns delete --zone staging.example.com --id {}
```

Without `--json`, output is human table — fine interactively, brittle for scripts.

### Pattern D — cache purge

```bash
# Selective — preferred. Pass full URLs, comma-separated.
flarectl zone purge --zone example.com \
  --files https://example.com/static/app.css,https://example.com/static/app.js

# Nuclear — invalidates the entire edge cache for the zone
flarectl zone purge --zone example.com --everything
```

`--everything` cause thundering-herd hit on origin. On high-traffic zone, prefer `--files` (URL list) or `--tags` (cache-tag, Enterprise) and warn team before run.

### Pattern E — user / account

```bash
flarectl user info                          # whoami for the active token/key
flarectl user update --first-name Mo        # update profile fields
```

Useful for verify token alive and which account/email it represent before destructive command. (Account-member invitations not in flarectl — use dashboard or `cloudflare-go` SDK direct.)

### Pattern F — `flarectl` vs `wrangler` vs raw API

- `flarectl` — DNS, zones, cache purge, user/account ops. Stable, Go binary, ships from `cloudflare-go` repo.
- `wrangler` — Workers, Pages, KV, R2, D1, Queues, Workflows, Pipelines. Supported tool for everything compute / storage.
- `gh api`-style raw curl — only when neither tool wraps endpoint (rare). Construct with `curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"` and pipe through `jq`.

If single workflow need both DNS and Worker route, run `flarectl` for DNS and `wrangler` for Worker — don't try do all from one CLI.

## Anti-patterns

- **Don't** use `CF_API_KEY` (global key) — has account-wide permission across every zone, billing, member action. Use `CF_API_TOKEN` with min scope (e.g. `Zone:DNS:Edit` for one zone) and rotate. Note: flarectl reads `CF_API_TOKEN` / `CF_API_KEY` / `CF_API_EMAIL` — NOT the `CLOUDFLARE_*` names used by `wrangler` and `cloudflare-go` SDK. Wrong env var = silent auth failure.
- **Don't** `--purge --everything` on high-traffic zone without warning team — origin gets every miss at once. Prefer `--files` / `--tags`.
- **Don't** create DNS records without explicit `--ttl` (300 for staging, `1` for "auto"). Default may be longer than want, misconfigured record at TTL 86400 = 24-hour outage.
- **Don't** use `flarectl` for Workers / Pages deployment — subcommands exist but lag `wrangler` on features, won't do bundling, secrets, env management. Use `wrangler` for compute.
- **Don't** assume `--proxy=true` correct for every record. MX, SRV, raw TCP, most mail records must be DNS-only — proxying break them silently.
- **Don't** run `flarectl` in CI with global key (`CF_API_KEY`) in environment — leak surface is entire account. Issue scoped token (`CF_API_TOKEN`) per pipeline, scope to smallest set of zones/permissions, rotate.
- **Don't** parse human table output with `awk`/`grep` — column widths shift with longer record names. Pass `--json` and use `jq`.
- **Don't** delete zone to "reset DNS" — every record gone and re-adding zone re-issues nameservers, break propagation. Delete records, not zones.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` deploy section — "DNS via flarectl, compute via wrangler, never `CF_API_KEY` in CI".
- Companion: `skills/wrangler` (third-party shipped per `skills/SOURCES.md`) — different scope; reach for it for Workers/Pages/KV/R2/D1. Note: `wrangler` reads `CLOUDFLARE_API_TOKEN`, `flarectl` reads `CF_API_TOKEN` — different envs, intentionally not unified.
- JSON pipelines: `skills/jq/SKILL.md` — `flarectl --json | jq` is canonical scripting shape.
- Upstream: <https://github.com/cloudflare/cloudflare-go/tree/master/cmd/flarectl>
- Token scopes reference: <https://developers.cloudflare.com/fundamentals/api/get-started/create-token/>