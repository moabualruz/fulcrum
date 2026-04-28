## Anti-patterns

- **Don't** use `CF_API_KEY` (the global key) — it has account-wide permission across every zone, billing, and member action. Use `CF_API_TOKEN` with the minimum scope (e.g. `Zone:DNS:Edit` for one zone) and rotate. Note: flarectl reads `CF_API_TOKEN` / `CF_API_KEY` / `CF_API_EMAIL` — NOT the `CLOUDFLARE_*` names used by `wrangler` and the `cloudflare-go` SDK. Wrong env var = silent auth failure.
- **Don't** `--purge --everything` on a high-traffic zone without warning the team — the origin gets every miss at once. Prefer `--files` / `--tags`.
- **Don't** create DNS records without an explicit `--ttl` (300 for staging, `1` for "auto"). The default may be longer than you want, and a misconfigured record at TTL 86400 is a 24-hour outage.
- **Don't** use `flarectl` for Workers / Pages deployment — the subcommands exist but lag `wrangler` on features and won't do bundling, secrets, or env management. Use `wrangler` for compute.
- **Don't** assume `--proxy=true` is correct for every record. MX, SRV, raw TCP, and most mail records must be DNS-only — proxying breaks them silently.
- **Don't** run `flarectl` in CI with the global key (`CF_API_KEY`) in the environment — leak surface is the entire account. Issue a scoped token (`CF_API_TOKEN`) per pipeline, scope it to the smallest set of zones/permissions, and rotate.
- **Don't** parse the human table output with `awk`/`grep` — column widths shift with longer record names. Pass `--json` and use `jq`.
- **Don't** delete a zone to "reset DNS" — every record is gone and re-adding the zone re-issues nameservers, breaking propagation. Delete records, not zones.
