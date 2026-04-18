// packages/memory/src/l1/templates/index.ts
//
// Memory v3 PR 2 — L1 template loader.
//
// The four canonical templates live as human-editable .md files in this same
// directory. They are the source of truth that humans inspect in git; the
// inline constants below are bundled copies used at runtime. The parity test
// in `src/tests/l1-templates.test.ts` asserts the inline strings match the
// .md files byte-for-byte, so editing the .md without updating the constants
// fails CI.
//
// Why inline rather than readFileSync(import.meta.url)? tsup bundles the
// memory package into a single `dist/index.js`. `new URL(..., import.meta.url)`
// at the bundled call site resolves against `dist/` top-level, which is not
// where we want to place .md files. Keeping the inline constants is simpler,
// preserves human-editability of the .md files, and avoids a bundler dance.

import type { L1PageType } from '../frontmatter.js'

const ENTITY_TEMPLATE = `---
id: {{ULID}}
schema: fulcrum.memory/v3
type: entity
entity_type: {{library|person|project|file|symbol|decision|concept}}
name: {{NAME}}
aliases: {{ALIAS_ARRAY}}
confidence: {{CONFIDENCE}}
first_seen: {{ISO_TIMESTAMP}}
last_confirmed: {{ISO_TIMESTAMP}}
sources:
  - {{L0_ULID_1}}
supersedes: []
superseded_by: null
retention_tier: working
access_count: 0
workspace_id: {{WORKSPACE_ID}}
project_id: {{PROJECT_ID}}
---

# {{NAME}}

{{ONE_LINE_DESCRIPTION}}

## Observed usage

{{PROSE_DESCRIBING_HOW_THIS_ENTITY_APPEARS_IN_SOURCES}}

Sources grounding the claims above:
- [[raw/{{SOURCE_TYPE_1}}/{{YYYY}}/{{MM}}/{{DD}}/{{L0_ULID_1}}]]

## Related

- [[entity/{{RELATED_ENTITY_ULID}}]]
`

const CONCEPT_TEMPLATE = `---
id: {{ULID}}
schema: fulcrum.memory/v3
type: concept
name: {{NAME}}
confidence: {{CONFIDENCE}}
sources: {{L0_ULID_ARRAY}}
sources_via: []
first_seen: {{ISO_TIMESTAMP}}
last_confirmed: {{ISO_TIMESTAMP}}
retention_tier: working
access_count: 0
supersedes: []
superseded_by: null
workspace_id: {{WORKSPACE_ID}}
project_id: {{PROJECT_ID}}
---

# {{NAME}}

{{ONE_PARAGRAPH_DEFINITION}}

## Evidence

{{PROSE_WITH_INLINE_WIKILINKS}}

Example: "The invariant was established in [[raw/decision/{{YYYY}}/{{MM}}/{{DD}}/{{L0_ULID_1}}]] after [[raw/session_transcript/{{YYYY}}/{{MM}}/{{DD}}/{{L0_ULID_2}}]] showed a regression."

## Implementation references

- \`{{FILE_PATH}}:{{LINE}}\` — {{CONTEXT}}
`

const PAGE_TEMPLATE = `---
id: {{ULID}}
schema: fulcrum.memory/v3
type: page
title: {{TITLE}}
source: {{L0_ULID}}
sources: [{{L0_ULID}}]
confidence: 1.0
entities: {{ENTITY_ULID_ARRAY}}
first_seen: {{ISO_TIMESTAMP}}
last_confirmed: {{ISO_TIMESTAMP}}
retention_tier: working
access_count: 0
workspace_id: {{WORKSPACE_ID}}
project_id: {{PROJECT_ID}}
---

# {{TITLE}}

Distilled from [[raw/{{SOURCE_TYPE}}/{{YYYY}}/{{MM}}/{{DD}}/{{L0_ULID}}]].

## Summary

{{TWO_TO_FOUR_SENTENCE_SUMMARY}}

## Key points

- {{POINT_1}} — see [[raw/{{SOURCE_TYPE}}/{{YYYY}}/{{MM}}/{{DD}}/{{L0_ULID}}]]
- {{POINT_2}}

## Entities mentioned

- [[entity/{{ENTITY_ULID_1}}]]
`

const SYNTHESIS_TEMPLATE = `---
id: {{ULID}}
schema: fulcrum.memory/v3
type: synthesis
title: {{TITLE}}
sources: []
sources_via:
  - {{L1_PAGE_ULID_1}}
  - {{L1_PAGE_ULID_2}}
confidence: {{CONFIDENCE}}
first_seen: {{ISO_TIMESTAMP}}
last_confirmed: {{ISO_TIMESTAMP}}
retention_tier: episodic
access_count: 0
supersedes: []
superseded_by: null
workspace_id: {{WORKSPACE_ID}}
project_id: {{PROJECT_ID}}
---

# {{TITLE}}

{{INTRODUCTION_TYING_SOURCES_TOGETHER}}

## Pattern

{{DISCOVERED_PATTERN}}

## Evidence

- [[page/{{L1_PAGE_ULID_1}}]] — {{CONTRIBUTION_1}}
- [[page/{{L1_PAGE_ULID_2}}]] — {{CONTRIBUTION_2}}

## Transitive L0 sources

Followed from the L1 pages above:
- [[raw/{{SOURCE_TYPE}}/{{YYYY}}/{{MM}}/{{DD}}/{{L0_ULID}}]]
`

const TEMPLATES: Record<L1PageType, string> = {
  entity: ENTITY_TEMPLATE,
  concept: CONCEPT_TEMPLATE,
  page: PAGE_TEMPLATE,
  synthesis: SYNTHESIS_TEMPLATE,
}

/**
 * Return the canonical template markdown for a v3 page type. The returned
 * string is the bundled copy; the parity test enforces it matches the .md
 * file in the same directory.
 */
export function loadTemplate(type: L1PageType): string {
  return TEMPLATES[type]
}

/**
 * No-op now that templates are inline. Kept as a stable surface so tests and
 * consumers from the earlier `import.meta.url` design keep compiling.
 */
export function resetTemplateCache(): void {
  /* intentional no-op */
}
