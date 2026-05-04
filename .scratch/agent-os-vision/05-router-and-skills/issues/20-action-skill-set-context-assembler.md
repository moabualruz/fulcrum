---
Status: completed
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 13-skills-loader-per-agent-install, 07-routing-trpc-procedures
ImplRuntime: claude
---

# action_skill_set → context assembler integration

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Wire `routing_rules.action_skill_set` into `src/context/assemble.ts` (Pillar 6 interface). When a routing rule fires with a non-empty `action_skill_set`, the context assembler reads the corresponding SKILL.md files from `fulcrum_skills` (by slug) and injects their content into the agent session context bundle. Missing slug → log warning, continue assembling with the remaining skills. This is the "Skills attach to routing rules" always-on feature.

## Acceptance criteria

- [x] Schema / module: `src/context/assemble.ts` accepts `skillSlugs: string[]` in the context bundle input
- [x] Schema / module: `src/skills/loader.ts` exports `readSkillContent(slug: string, orgId: string): Promise<string | null>` (reads SKILL.md from agent dir or DB)
- [x] Logic: rule with `action_skill_set: ['tdd', 'caveman']` → both SKILL.md contents included in context bundle
- [x] Logic: missing slug → `console.warn` + skip (not an error; bundle continues with other skills)
- [x] Logic: empty `action_skill_set` → no skill content added (no-op)
- [x] Logic: context bundle is capped by token budget (truncate skills proportionally with other bundle slices)
- [x] Surfaces parity: skill injection happens server-side before agent run; no surface-specific changes
- [x] Tests: routing decision with `action_skill_set: ['tdd']` → context bundle includes SKILL.md content of `tdd`
- [x] Tests: missing slug → no error thrown; bundle has remaining skills
- [x] Tests: empty `action_skill_set` → bundle unchanged

## Blocked by

- `13-skills-loader-per-agent-install`
- `07-routing-trpc-procedures`

## Notes

`src/context/assemble.ts` is owned by Pillar 6 (Memory/Context). Coordinate with that pillar on the interface. The input to assemble should include `skillSlugs` alongside the existing memory/docs/runs/repo slices from Q18. This issue implements the skills slice only; the full context assembler is Pillar 6 scope.
