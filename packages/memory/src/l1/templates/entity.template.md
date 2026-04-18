---
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
