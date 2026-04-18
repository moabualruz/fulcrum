# Memory v3 — Progress Ledger

Append-only. Every unit of work gets one entry. The reusable prompt at `2026-04-18-002-memory-tiered-architecture-prompt.md` reads the last entry to find the resume point.

## Entry format

```
### YYYY-MM-DD HH:MM — PR {N} unit {N.M} — {status}
- Skills invoked: <list>
- Summary: <one line>
- Commit: <sha>
- Next: <planned next unit>
- Notes: <optional blockers, deviations, follow-ups>
```

Status values: `in_progress`, `completed`, `blocked`, `deferred`, `rolled_back`.

**Rules:**
- Never edit a past entry; append a new one with updated status if something changes.
- `in_progress` entries must be followed by `completed` or `blocked` before a new unit starts.
- Skill list must match what was actually invoked (auditable).
- `Commit` is the primary work commit for the unit (not the ledger-update commit).

---

## Log

### 2026-04-18 15:00 — PR 0 unit 0.1 — completed
- Skills invoked: agent-skills:spec-driven-development, agent-skills:planning-and-task-breakdown, elements-of-style:writing-clearly-and-concisely, WebSearch (for curator model research)
- Summary: Plan document `2026-04-18-002-memory-tiered-architecture-plan.md` committed to `docs/plans/`.
- Commit: 0a01aff (initial), bf29f10 (model pinning), 6896578 (templates + traceability), 6e859ff (skill matrix + test corpus)
- Next: PR 0 unit 0.2 — migration SQL `2026-04-19-001-memory-v3-lifecycle.sql`
- Notes: Plan is 930 lines. Approval checklist fully green. Awaiting user go-ahead to start PR 0 unit 0.2.
