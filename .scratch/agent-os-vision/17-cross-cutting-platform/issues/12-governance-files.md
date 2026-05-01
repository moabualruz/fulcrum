---
Status: ready-for-agent
Triage: HITL
Pillar: 17-cross-cutting-platform
Blocked-by: None
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-governance, A5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (A5 license/legal/contributing, C6 governance, C7 versioning)
Docs: https://www.contributor-covenant.org/version/2/1/code_of_conduct/
---

# Governance files — GOVERNANCE.md, SECURITY.md, CODE_OF_CONDUCT.md, VERSIONING.md

## What to build

Author four governance files at repo root. **GOVERNANCE.md**: mission statement (local-first Agent OS, human+AI parity, no distinction between AI and human projects); single-author + open-contribution model; issue triage SLA (critical security 24h, bug 7d, feature request triaged in next planning cycle); decision-making process (maintainer decision for architecture; community RFC process for breaking changes, linked to PR template); path to v1.0 (all 16 pillars shipped + zero P0 bugs + 90-day bug-bash window). **SECURITY.md**: responsible disclosure email (`security@<domain>` placeholder); private GitHub advisory → maintainer patches → embargo ≤90 days → public disclosure; security surface scope (auth, secrets/keyring, sandbox isolation, data-at-rest encryption, HTTPS in production). **CODE_OF_CONDUCT.md**: Contributor Covenant 2.1 verbatim; enforcement contact (same email as SECURITY.md). **VERSIONING.md**: semver policy (0.x = breaking changes OK with CHANGELOG entry; 1.0 = all 16 pillars + zero P0 + 90-day bug-bash); release cadence (monthly minor, on-demand patch, security hotfix within 24h); deprecation policy (one minor version warning before removal); v1.0 readiness criteria checklist.

CI lint gate: `bun run lint:docs` → checks heading structure, required sections, no placeholder text (e.g. "TODO", "TBD", "your-email@example.com").

HITL: human reviews tone + contact email before merge.

## Acceptance criteria

- [ ] All four files present at repo root.
- [ ] `GOVERNANCE.md`: contains headings "Mission", "Contribution Model", "Triage SLA", "Decision Process", "Path to v1.0".
- [ ] `SECURITY.md`: contains disclosure email, embargo timeline, security surface scope.
- [ ] `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1 full text; enforcement contact present.
- [ ] `VERSIONING.md`: semver policy section, release cadence, v1.0 criteria checklist, deprecation policy.
- [ ] CI `bun run lint:docs` passes: no placeholder text, all required headings present in each file.
- [ ] Human review: tone appropriate for an open-source project; no legal inaccuracies; contact email replaced with real address.

## Blocked by

- None — can start immediately (no code dependencies; pure documentation).
