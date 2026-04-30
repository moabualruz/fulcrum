# .scratch — Local-Markdown Issue Tracker

Per `docs/agents/issue-tracker.md`: one feature per directory. Each `<feature-slug>/` contains a `PRD.md`, optional companion docs (PLAYBOOK.md, RESEARCH-DESIGN.md, etc.), and `issues/<NN>-<slug>.md` once the PRD is broken into tickets.

`Status:` line near the top of each file records triage state (see `docs/agents/triage-labels.md`).

## Active features

| Feature                            | PRD status         | Issues | Notes                                                                |
| ---------------------------------- | ------------------ | ------ | -------------------------------------------------------------------- |
| `component-lifecycle-management`   | ready-for-agent    | 13     | All issues `Status: done`. Shipped on `main`.                        |
| `plugin-extension-surface-parity`  | ready-for-agent    | 14     | All issues `Status: done`. Shipped on `main`.                        |
| `product-kernel`                   | ready-for-agent    | 12     | 10 `ready-for-agent`; issues 02 + 11 `ready-for-human` (UI scaffold). |

Originals preserved under `docs/superpowers/{plans,specs}/`. The `.scratch/` copies are the canonical source for ongoing work; the `docs/superpowers/` versions are an archival record of how the work was first written.
