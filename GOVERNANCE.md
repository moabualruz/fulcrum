# Governance

## Mission

Fulcrum is a local-first Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts. Human and AI agent work use the same projects, tasks, documentation, memory, and governance rules; Fulcrum does not create a separate class of "AI projects."

The project favors deterministic local defaults, clear operator control, and parity across Web/API, CLI, and TUI surfaces.

## Contribution Model

Fulcrum is maintained as a single-author project with open contribution. The maintainer owns final product direction, architecture, releases, and security response. Community contributions are welcome when they fit the roadmap, include tests, preserve local-first defaults, and follow the repository's agent rules.

Contributors can propose issues, bug fixes, documentation improvements, research findings, and feature PRs. Large or breaking changes should start as an RFC issue before implementation.

Security-sensitive governance concerns should be sent to security@fulcrum.local.

## Triage SLA

- Critical security report: acknowledged within 24 hours.
- Confirmed bug report: triaged within 7 days.
- Feature request: triaged in the next planning cycle.

These targets are triage commitments, not guaranteed fix dates.

## Decision Process

Architecture decisions are made by the maintainer after reviewing implementation impact, compatibility with the Agent OS vision, and maintenance cost. Breaking changes require a community RFC issue linked from the PR, with migration notes and rollback guidance.

For ordinary fixes, the PR description should explain the problem, the chosen approach, tests run, and any user-facing behavior change.

## Path to v1.0

Fulcrum reaches v1.0 when:

- All 16 product pillars are shipped.
- Web/API, CLI, and TUI surfaces have feature parity for shipped domains.
- Zero P0 bugs remain open.
- A 90-day bug-bash window completes without release-blocking regressions.
- Governance, security, versioning, and dependency-license gates pass in local CI.
