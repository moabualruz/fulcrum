---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [03-custom-field-defs-schema, 07-task-crud-baseline]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q9]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Custom fields tRPC procedures + task detail renderer

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-05, T6-17, T6-39)

## What to build
tRPC `customFields.*` procedures (list/create/update/archive/reorder); task detail
custom-fields renderer that shows each field in `position` order with type-appropriate
input; required-field save guard; Web Settings → Fields tab; CLI `fulcrum fields *`;
TUI detail pane custom-fields section.

## Acceptance criteria
- [ ] tRPC `customFields.list(projectId)`: returns non-archived fields ordered by `position`
- [ ] tRPC `customFields.create`: validates `type` + `config_json` via discriminated union (slice 03); inserts with next `position`
- [ ] tRPC `customFields.update`: updates name/config/required/position; archived=true hides from UI
- [ ] tRPC `customFields.archive(id)`: sets `archived=true`; does NOT delete; existing `tasks.custom_fields` values preserved
- [ ] tRPC `customFields.reorder([{id, position}])`: transactional bulk position update
- [ ] tRPC `tasks.update` enforces required custom fields: if any non-archived `required=true` field missing from `custom_fields` payload, returns typed Zod error with field slug
- [ ] Web task detail: custom fields section renders fields in `position` order; each type renders correct input — text→`<Input>`, select→`<Select>`, multi_select→`<MultiSelect>`, number→`<NumberInput>`, date→`<DatePicker>`, user→`<UserPicker>`, url→`<UrlInput>`, json→`<Textarea>`; required fields show red asterisk; save blocked until required fields filled
- [ ] Web Settings → Fields tab (`/projects/<id>/settings/fields`): list fields with type badge, drag-to-reorder, add button, archive button; type-specific config form per type (options editor for select/multi_select, unit/decimals/min/max for number, etc.)
- [ ] CLI: `fulcrum fields list --project <id> --json` returns typed array
- [ ] CLI: `fulcrum fields create --type select --config-json '{"options":[...]}' --project <id> --json`
- [ ] CLI: `fulcrum tasks list --json` output includes `custom_fields` object with slug-keyed values
- [ ] TUI: task detail pane shows custom fields section with current values; `f` key focuses fields editor
- [ ] Tests: `customFields.create` with invalid `config_json` for type (e.g. select missing `options`) returns Zod error
- [ ] Tests: `tasks.update` with missing required field returns typed error naming the field
- [ ] Tests: `customFields.archive` preserves values in existing tasks
- [ ] Tests: `customFields.reorder` transactional — partial failure rolls back all positions

## Blocked by
- 03-custom-field-defs-schema
- 07-task-crud-baseline

## Notes / Tech-stack hints
- `tasks.custom_fields` is slug-keyed: `{ "priority": "high", "story_points": 3, ... }`
- `url` type with `display_as: 'embed'` renders an `<iframe>` in the detail page; CSP must allow
- `user` type with `multi: true` stores `uuid[]` in the jsonb value
