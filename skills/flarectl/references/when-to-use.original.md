## When to use

- The user wants to inspect or mutate Cloudflare DNS — list records, create an A/CNAME/MX, flip the proxied flag, change TTL, delete a stale entry.
- The user asks about zone state — pending nameservers, plan, status, settings — for a domain on Cloudflare.
- The user wants to purge the Cloudflare edge cache, by URL or wholesale, after a deploy.
- The agent is about to script against `api.cloudflare.com` for DNS/zone CRUD — `flarectl` handles auth, paging, and JSON without bespoke curl.
- The user wants `--json` output to pipe into `jq` for further filtering.

**Skip** for: Workers / Pages / KV / R2 / D1 / Queues — that's `wrangler` (different scope, supported tool for compute). Domain registration. Non-Cloudflare DNS providers (`aws route53`, `hcloud dns`, `gcloud dns`). In-app SDK calls from Go/TS source — use `cloudflare-go` / `cloudflare-typescript` directly.
