# Agents

> Application-layer reads and writes over **AgentProfile** rows: listing, upserting, masking secrets for the UI, and recording test outcomes. Inherits the parent service vocabulary (**AgentProfile**, **AgentRun**, **Org**) and only sharpens the terms that exist solely inside this folder.

## Language

**MaskedProfileRow**:
A UI-safe projection of an `AgentProfileRow` where each `authEnv` value is replaced with a fixed-width mask, plus derived `capabilities` and `sessions_count`.
_Avoid_: Sanitized profile, redacted profile, view-model.

**AuthEnvEntry**:
One `KEY=VALUE` string inside `AgentProfile.authEnvVars`; parsed into a `{key, maskedValue}` pair for display.
_Avoid_: Credential, secret pair, env tuple.

**Capability**:
A tag (`LLM`, `code`, `multi-modal`, `search`, `browser`, `general`) derived from an `AgentProfile.name` heuristic; advisory UI hint only.
_Avoid_: Skill, feature, ability.

**ProfileTestOutcome**:
The boolean verdict (`testPassed`) plus `lastTestedAt` timestamp recorded by `testProfileAction`; emits an `agent_profile / tested` event.
_Avoid_: Health check, smoke test result.

**AgentProfilesPageData**:
The bundle (`profiles`, `projects`, `tasks`) assembled for the profile-list UI route.
_Avoid_: Page payload, view data.

## Relationships

- One **AgentProfile** has exactly one **MaskedProfileRow** projection per render.
- One **MaskedProfileRow** has zero-or-more **AuthEnvEntry** items and zero-or-more **Capability** tags.
- One **AgentProfile** has at most one current **ProfileTestOutcome** (`testPassed` + `lastTestedAt`).
- One **AgentProfilesPageData** aggregates many **MaskedProfileRows** with the **Org**'s `ProjectOption` and `TaskOption` lists from `work-management`.

## Example dialogue

> **Dev:** "Why does `maskProfile` derive **Capability** tags from the name?"
> **Domain expert:** "It's a UI hint, not a domain fact — the **AgentProfile** itself doesn't store capabilities. The list view needs badges, so we infer them from the agent name until a real capability field exists."
> **Dev:** "And the **AuthEnvEntry** values?"
> **Domain expert:** "Always masked at the application boundary. Raw `authEnvVars` never leave this module unmasked; the **MaskedProfileRow** is the only shape the interface layer sees."

## Flagged ambiguities

- **"Capability" vs `agent-runtime` capabilities** — here it's a name-derived UI tag. The runtime's actual tool/permission capabilities live in `ToolAuthorityTrace` (parent context). Do not conflate.
- **`testProfile` vs `testProfileAction`** — `testProfileAction` records a given outcome; `testProfile` is the higher-level helper that derives the outcome from `cliPath` presence and then calls the action.
