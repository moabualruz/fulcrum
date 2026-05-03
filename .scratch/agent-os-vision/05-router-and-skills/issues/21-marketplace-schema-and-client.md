---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 02-fulcrum-skills-schema-migration
---

# Skill marketplace schema + Ed25519 client (FULCRUM_FEATURES=skill-marketplace)

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Write the idempotent migration for `marketplace_listings` + `org_marketplace_keys` tables. Implement `src/skills/marketplace-client.ts` — fetches a skill listing from the shared registry endpoint, verifies the Ed25519 signature against the publisher org's public key stored in `org_marketplace_keys`, and rejects on bad sig or missing key. All marketplace code is behind a `FULCRUM_FEATURES=skill-marketplace` guard; calling any marketplace function with flag OFF throws `FeatureDisabledError`.

## Acceptance criteria

- [ ] Schema / module: `marketplace_listings` migration is idempotent; unique constraint on `(slug, version)`; `(publisher_org_id)` index present
- [ ] Schema / module: `org_marketplace_keys(org_id, public_key, created_at, revoked_at)` migration is idempotent
- [ ] Schema / module: `src/skills/marketplace-client.ts` exports `fetchListing(slug: string, version?: string): Promise<MarketplaceListing>` (flag-guarded)
- [ ] Schema / module: `verifySignature(listing: MarketplaceListing, publisherOrgId: string): Promise<boolean>` using Ed25519 via WebCrypto
- [ ] Logic: valid signature → returns `true`; bad signature → `false` + logged error
- [ ] Logic: missing public key in `org_marketplace_keys` → throws `SignatureVerificationError`
- [ ] Logic: `FULCRUM_FEATURES=skill-marketplace` OFF → all marketplace functions throw `FeatureDisabledError`
- [ ] Logic: revoked key (`revoked_at` non-null) treated as missing
- [ ] Tests: migration idempotency
- [ ] Tests: valid sig → `true`; tampered manifest → `false`
- [ ] Tests: flag-off guard test

## Blocked by

- `02-fulcrum-skills-schema-migration`

## Notes

Ed25519 via Node.js `crypto.subtle.verify` (WebCrypto, no external dep). Public key stored as base64url. Signature covers the serialized `manifest_json` + `slug` + `version` concatenated.
