# Cross-agent compliance suite

This directory contains TDD-style **compliance tests** — one file per target
CLI, each asserting that Fulcrum's emitted artifacts + hook handlers conform
to the documented extension contract of that host.

The suite is the spec gate for the PR 7 expanded scope
(cross-agent integration correctness). A checklist row in
`docs/reference/2026-04-20-integration-completeness-checklist.md` can ONLY
flip to ✅ when its compliance test is green.

## Files

| Target | File | Source research |
|---|---|---|
| Claude Code | `claude-compliance.test.ts` | PR 5 + 14.1 recheck (2026-04-20) |
| Codex CLI | `codex-compliance.test.ts` | PR 6 recheck (2026-04-20) |
| Gemini CLI | `gemini-compliance.test.ts` | PR 7 deep research (2026-04-20) |
| opencode | `opencode-compliance.test.ts` | PR 4 recheck (2026-04-20) |
| PI cockpit | `pi-compliance.test.ts` | PR 8 pre-research (2026-04-20) |
| Copilot | `copilot-compliance.test.ts` | PR 10 pre-research (2026-04-20) |
| Cursor | `cursor-compliance.test.ts` | PR 11 pre-research (2026-04-20) |
| Windsurf | `windsurf-compliance.test.ts` | PR 12 pre-research (2026-04-20) |

## Conventions

- **Every failing assertion is tagged `GAP(<id>)`** in a comment that maps to
  the research finding. The `<id>` prefix names the agent + fix tier (e.g.
  `claude-M1` = Claude MUST_FIX #1, `oc-S2` = opencode SHOULD_FIX #2).
- **Red is OK.** Tests that fail today document the work still owed. When
  the fix lands, the test goes green — no code-change to the test.
- **Doc citations inline.** Every test names the upstream doc that defines
  the contract (e.g. `docs/hooks/reference.md`,
  `plugin-structure/references/manifest-reference.md`).
- **No mocks for emitted files.** Tests parse the real artifacts under
  `agent-integration/<agent>/` so drift between canonical source and
  emitted output is caught.

## Running

```bash
# all compliance tests
pnpm -F fulcrum-agent-cli test compliance

# one agent
pnpm -F fulcrum-agent-cli test compliance/claude-compliance

# watch a single agent during a fix loop
pnpm -F fulcrum-agent-cli test -- --watch compliance/gemini-compliance
```

## Per-step gate

Every PR 7 sub-unit (Gemini fixes, opencode fixes, Claude fixes, Codex fixes)
MUST:

1. Start with one or more red tests in the compliance suite (the GAP comments
   identify them).
2. Land the code change that turns those tests green.
3. Commit with the compliance run attached as evidence.
4. Flip the corresponding checklist row only when the compliance test is green.

This closes the overclaim loop: the checklist cannot advance past what the
compliance suite certifies.
