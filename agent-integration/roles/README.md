# Fulcrum Role Definitions

Per-role system prompts and capability documentation. `listAgentProfiles()` in
`@moabualruz/fulcrum-core` reads the "Purpose" section from each file at runtime and
returns it as the role description, falling back to the hardcoded description
in `packages/core/src/status.ts` when a file is absent.

Files in this directory are the source of truth for role descriptions. If you
add a new role to the `AgentRole` type in `packages/core/src/types.ts`, also
add a matching `<role>.md` here.

## Current roles

- `chief_of_staff.md` — L1 orchestration (only L1 role)
- `software_engineer.md` — L2 implementation (backend + frontend consolidated)
- `integration_worker.md` — L2 merge owner (only role permitted `shell_exec:git`)
- `code_reviewer.md` — L2 code review
- `security_reviewer.md` — L2 security review
- `tech_lead.md` — L2 architecture and design

The remaining 18 roles in the `AgentRole` union fall back to the hardcoded
descriptions in `status.ts`. Add an MD file here to override the fallback.

## File format

Every role file follows this outline:

```
# {Role Name} (`{role_slug}`)

## Purpose
{one paragraph — extracted verbatim into listAgentProfiles()}

## Responsibilities
- ...

## Prohibitions
- ...

## Tools / Capabilities
- ...

## Response format
(optional — only roles with a structured output format, e.g. chief_of_staff)
```

The "Purpose" section is load-bearing: its text is parsed and returned as the
`description` field by `listAgentProfiles()`. Keep it to one paragraph, written
as prose (not bullets), and make the first sentence a standalone definition of
the role — that sentence is what downstream UIs surface first.
