## Patterns

### Pattern A — zones

```bash
flarectl zone list                                  # all zones the token can see
flarectl zone info   --zone example.com             # plan, status, nameservers
flarectl zone create --zone example.com             # add a zone (you still have to point NS)
flarectl zone delete --zone example.com             # destructive — confirm twice
flarectl zone settings --zone example.com           # SSL mode, min TLS, brotli, etc.
```

Zone status `pending` means Cloudflare hasn't seen the registrar's nameserver delegation yet — `zone info` is the source of truth.

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

`--proxy=true` routes through Cloudflare (orange cloud); `--proxy=false` is DNS-only (grey cloud). MX, SRV, raw-TCP, and most mail records **must** be DNS-only.

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

Without `--json`, output is a human table — useful interactively, brittle for scripts.

### Pattern D — cache purge

```bash
# Selective — preferred. Pass full URLs, comma-separated.
flarectl zone purge --zone example.com \
  --files https://example.com/static/app.css,https://example.com/static/app.js

# Nuclear — invalidates the entire edge cache for the zone
flarectl zone purge --zone example.com --everything
```

`--everything` causes a thundering-herd hit on the origin. On a high-traffic zone, prefer `--files` (URL list) or `--tags` (cache-tag, Enterprise) and warn the team before running.

### Pattern E — user / account

```bash
flarectl user info                          # whoami for the active token/key
flarectl user update --first-name Mo        # update profile fields
```

Useful for verifying a token is alive and which account/email it represents before a destructive command. (Account-member invitations are not in flarectl — use the dashboard or the `cloudflare-go` SDK directly.)

### Pattern F — `flarectl` vs `wrangler` vs raw API

- `flarectl` — DNS, zones, cache purge, user/account ops. Stable, Go binary, ships from the `cloudflare-go` repo.
- `wrangler` — Workers, Pages, KV, R2, D1, Queues, Workflows, Pipelines. The supported tool for everything compute / storage.
- `gh api`-style raw curl — only when neither tool wraps the endpoint (rare). Construct with `curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"` and pipe through `jq`.

If a single workflow needs both DNS and a Worker route, run `flarectl` for DNS and `wrangler` for the Worker — don't try to do it all from one CLI.
