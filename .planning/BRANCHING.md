# Branching Strategy — v1.0

## Structure

```
main (frozen — no direct commits until v1.0 complete)
 └─ dev/v1.0 (integration branch — all phases merge here)
     ├─ phase/01-arch-convergence
     ├─ phase/02-bugfixes-foundation
     ├─ phase/03-symphony-sandcastle
     ├─ phase/04-inference-router-skills
     ├─ phase/05-task-management
     ├─ phase/06-docs-memory-search
     ├─ phase/07-repos-artifacts-notifications
     ├─ phase/08-surface-delivery
     ├─ phase/09-cross-cutting-testing
     └─ phase/10-saas-hardening
         └─ final: dev/v1.0 → main (1 merge, full CI)
```

## Per-Phase Flow

1. Branch `phase/NN-name` from `dev/v1.0`
2. `/gsd-plan-phase N` → PLAN.md
3. `/gsd-execute-phase N` → implement with TDD
4. `/gsd-verify-work N` → UAT against success criteria
5. `ce-simplify-code` → post-impl cleanup
6. Diff review: `git diff dev/v1.0...phase/NN-name`
7. Run checks: `bun run ci` (or project test command)
8. Merge to `dev/v1.0` (fast-forward or merge commit)
9. Delete phase branch

## Rules

- No PRs until final `dev/v1.0 → main` merge
- Phase branches reviewed via diff + checks before merge
- Each phase merge to `dev/v1.0` is a clean integration point
- If phase breaks `dev/v1.0`, fix on phase branch before merge
- Commit messages: conventional commits (`feat`, `fix`, `refactor`, `test`, `docs`)
