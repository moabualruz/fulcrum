---
Status: ready-for-agent
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [09-web-repo-list-and-dashboard]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C4, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [shadcn-svelte]
---

## What to build

Web route `/projects/<id>/repos` — multi-repo view scoped to a single project. Lists all repos associated with the project, each card showing current branch, sync status, open task count, and a "recent activity" mini-log (last 3 commits). Also supports adding a new repo directly from the project context (sets `repos.project_id` automatically). Supports the `tasks.repo_id` FK: task creation within the project offers a repo selector.

## Acceptance criteria

- [ ] `/projects/<id>/repos` lists all `repos WHERE project_id=<id>` as cards.
- [ ] Each card: repo name, kind badge, current branch, sync status badge, open task count (linked to `/tasks?project=<id>&repo=<repoId>`), last 3 commits (subject + relative time).
- [ ] "Add repo to project" action: opens same add-repo modal from slice 09 but pre-fills `project_id`.
- [ ] Existing repos (registered globally) can be linked to the project via a "Link existing repo" action.
- [ ] `/tasks/new` within a project shows a "Repo" field (select from project repos, nullable); saves to `tasks.repo_id`.
- [ ] Project nav sidebar gains a "Repos" link entry pointing to `/projects/<id>/repos`.
- [ ] Playwright e2e: create project, add two repos, verify both cards render, create task with repo_id, verify task detail shows linked repo.

## Blocked by

- 09-web-repo-list-and-dashboard
