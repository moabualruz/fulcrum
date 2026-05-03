---
Status: implemented
Triage: AFK
ImplRuntime: claude
Pillar: 05-router-and-skills
Blocked-by: 21-marketplace-schema-and-client
---

# Marketplace publisher + org key generation (FULCRUM_FEATURES=skill-marketplace)

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement `src/skills/marketplace-publisher.ts` — signs a SKILL.md manifest with the org's Ed25519 private key and POSTs to the registry. Version conflict (same slug+version already published) → error, no overwrite. Implement `fulcrum marketplace keygen` CLI command — generates an Ed25519 keypair, stores private key in local keyring (`~/.fulcrum/keyring/<org_id>.key`, chmod 600), publishes public key to registry via `org_marketplace_keys` insert. All gated behind `FULCRUM_FEATURES=skill-marketplace`.

## Acceptance criteria

- [ ] Schema / module: `src/skills/marketplace-publisher.ts` exports `publishSkill(slug: string, orgId: string): Promise<MarketplaceListing>` (flag-guarded)
- [ ] Logic: publish signs `manifest_json + slug + version` with org private key; POSTs to registry; returns created `MarketplaceListing`
- [ ] Logic: publishing same `(slug, version)` twice → second call throws `VersionConflictError` (unique constraint + app-level check)
- [ ] Logic: private key stored at `~/.fulcrum/keyring/<org_id>.key` with permissions 600
- [ ] Logic: `fulcrum marketplace keygen` generates keypair, writes private key to keyring, inserts public key row in `org_marketplace_keys`
- [ ] Logic: `keygen` run twice for same org → prompts for confirmation before overwriting (no silent overwrite)
- [ ] Logic: flag OFF → all publisher/keygen functions throw `FeatureDisabledError`
- [ ] Surfaces parity: `keygen` is CLI-only (no TUI/Web key management beyond viewing keys)
- [ ] Tests: publish → listing row in DB with correct `publisher_org_id`
- [ ] Tests: duplicate version → error
- [ ] Tests: keygen writes private key file with mode 600
- [ ] Tests: flag-off guard

## Blocked by

- `21-marketplace-schema-and-client`

## Notes

Private key file security: use `fs.chmod(path, 0o600)` after write. Never log or expose private key in error messages. The registry endpoint for POST is `FULCRUM_MARKETPLACE_URL` env var (default: `https://marketplace.fulcrum.dev` — not yet running; mock in tests).
