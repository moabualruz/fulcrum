# 20 — Scratch workflow repair

Status: ready-for-agent
Risk tier: medium
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` F3, F4
File ownership:
- `.scratch/product-kernel/PLAYBOOK.md`
- `.scratch/product-kernel/RESEARCH-DESIGN.md`
- `.scratch/product-kernel/issues/02-ui-compatibility-spike.md`
- `.scratch/product-kernel/issues/11-web-shell-and-state-bridge.md`
- `.scratch/README.md`

Acceptance criteria:
- Companion docs (`PLAYBOOK.md`, `RESEARCH-DESIGN.md`) move to `Status: done` (or another canonical label) consistent with the parent PRD.
- Issues 02 and 11 either drop the `## Assumption` framing now that they shipped or split it into a separate `## Comments` block; both have an explicit `Acceptance criteria:` heading.
- `.scratch/README.md` table reflects the actual count and statuses.
