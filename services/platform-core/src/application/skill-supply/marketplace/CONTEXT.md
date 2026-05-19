# Skill Supply: Marketplace

Sub-area of **Skill Supply** owning the signed-listing registry and its tRPC-style procedures (`browse`, `fetch`, `publish`, `verify`, `install`). Parent vocabulary (**MarketplaceListing**, **OrgMarketplaceKey**, **FulcrumSkill**) is defined in `services/platform-core/src/application/skill-supply/CONTEXT.md`; this file refines only the marketplace-local terms.

## Language

**ListingRegistry**:
The in-memory `slug -> MarketplaceListing` map backing `browseListings` / `fetchListing` / `upsertListing` until persistent marketplace tables land.
_Avoid_: marketplace store, listings DB, catalog

**ContentHash**:
Hex SHA-256 digest of a skill's content (SKILL.md body), recomputed during **VerifyProcedure** and recorded on every **MarketplaceListing**.
_Avoid_: skill hash, manifest digest, checksum

**MarketplaceProcedure**:
One of the five exported call-sites — `browse`, `fetch`, `publish`, `verify`, `install` — each gated by a **MarketplaceFeatureGate**.
_Avoid_: marketplace endpoint, route, handler

**MarketplaceFeatureGate**:
The `isFeatureEnabled("skill-marketplace")` check at every procedure entry that raises `FeatureDisabledError` when the `skill-marketplace` flag is off.
_Avoid_: marketplace flag, feature switch

**InstallProcedure**:
The `install` **MarketplaceProcedure** that fetches a listing, asserts a non-empty signature, and (eventually) delegates to the parent **Skill Supply** install path.
_Avoid_: download, pull, marketplace install handler

## Relationships

- A **MarketplaceProcedure** call passes the **MarketplaceFeatureGate** before touching the **ListingRegistry**.
- A `publish` **MarketplaceProcedure** signs `input.content`, derives a **ContentHash**, and upserts one **MarketplaceListing** into the **ListingRegistry**.
- A `verify` **MarketplaceProcedure** reads a **MarketplaceListing** from the **ListingRegistry** and checks its signature against the recorded **ContentHash**.
- An **InstallProcedure** requires a non-empty signature on the **MarketplaceListing**, else raises `SignatureVerificationError`; on success, the parent **Skill Supply** mirrors the skill into each **AgentInstallDir**.

## Example dialogue

> **Dev:** "Where does `skills.marketplace.browse` actually read from today?"
> **Domain expert:** "The **ListingRegistry** — an in-memory `Map` seeded by `seedRegistry` or by prior `publish` **MarketplaceProcedure** calls. Persistent tables come later; the procedure shape stays the same."
> **Dev:** "And if the feature flag is off?"
> **Domain expert:** "The **MarketplaceFeatureGate** throws `FeatureDisabledError` before the **ListingRegistry** is touched, so `browse`, `fetch`, `publish`, `verify`, and `install` all fail closed."

## Flagged ambiguities

- "registry" overlapped the marketplace-local **ListingRegistry** (this file) and the parent **SkillRegistryEntry** projection — resolved: **ListingRegistry** is the signed-listing store; the parent registry merges local/upstream/mcp views.
- "install" overlapped the **InstallProcedure** (marketplace-side fetch + signature check) and the parent **Skill Supply** install (lock + **AgentInstallDir** mirror) — resolved: the **InstallProcedure** verifies and hands off; mirroring stays in the parent area.
