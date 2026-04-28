## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` deploy section — "DNS via flarectl, compute via wrangler, never `CF_API_KEY` in CI".
- Companion: `skills/wrangler` (third-party shipped per `skills/SOURCES.md`) — different scope; reach for it for Workers/Pages/KV/R2/D1. Note: `wrangler` reads `CLOUDFLARE_API_TOKEN`, `flarectl` reads `CF_API_TOKEN` — different envs, intentionally not unified.
- JSON pipelines: `skills/jq/SKILL.md` — `flarectl --json | jq` is the canonical scripting shape.
- Upstream: <https://github.com/cloudflare/cloudflare-go/tree/master/cmd/flarectl>
- Token scopes reference: <https://developers.cloudflare.com/fundamentals/api/get-started/create-token/>
