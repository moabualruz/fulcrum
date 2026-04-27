# Task Management

> Plane (self-hosted) for issues, cycles, milestones, and project-scoped working docs (Pages). Memory is in [memory.md](memory.md); this doc covers task management only.

## 1. Why Plane

Information has a *lifecycle*. Things with completion states (tasks, bugs, features, sprint planning) belong here; permanent knowledge belongs in the vault ([memory.md](memory.md) §3).

Plane stores:
- **Issues** — tasks, bugs, features
- **Cycles** — sprints
- **Milestones** — release scopes
- **Pages** — project-scoped working docs: feature specs, TDDs, sprint briefs, PRDs, post-mortems

Pages are *project-scoped* working docs, not memory. They die with the project. Cross-project knowledge lives in the vault.

## 2. Settled decisions

| # | Decision | Answer |
|---|---|---|
| 1 | Plane endpoint | Configurable via `PLANE_ENDPOINT` env var (or `~/.config/plane/endpoint`). Default: `http://localhost:8000` (local Docker). Remote hosts (Hetzner, Plane Cloud, anything HTTPS) are out-of-scope to install but supported by changing the env var. Skills/scripts must read the env, never hard-code. |
| 2 | Workspace shape | One workspace, many projects. Each codebase becomes a Plane project. |
| 3 | Auth | API key per agent in `~/.config/plane/key`. Generated from Plane web UI after first user signup. |
| 4 | Hetzner / cloud migration | **Out of scope.** Remote endpoints supported via `PLANE_ENDPOINT`; deployment to specific hosts is the user's call. |

## 3. Local Docker setup

Use the official compose file from `plane-app/plane`:

```bash
mkdir -p ~/.fulcrum/plane && cd ~/.fulcrum/plane
curl -fsSL https://raw.githubusercontent.com/makeplane/plane/master/docker-compose.yml -o docker-compose.yml
# Pin to a known-good tag once verified — never run :latest in long-lived state.
docker compose up -d
echo "PLANE_ENDPOINT=http://localhost:8000" >> ~/.config/plane/endpoint
```

| Concern | Choice |
|---|---|
| Version pin | Pin to a tagged release (e.g. `v0.24.x`) by editing `image:` lines after first install |
| Volumes | `~/.fulcrum/plane/volumes/{postgres,redis,minio,uploads}` — kept under fulcrum so a single backup covers all of fulcrum |
| Web port | `PLANE_WEB_PORT=3000` (default conflicts with many dev servers — override) |
| API port | `PLANE_API_PORT=8000` |
| Endpoint resolution | Skills/scripts read `$PLANE_ENDPOINT`. Override to point at any HTTPS host. |
| Auth | API key per agent in `~/.config/plane/key`. Generated from Plane web UI after first user signup. |
| Backup | `pg_dump` on the postgres container + tar of `volumes/uploads/` (and `minio/`) — daily cron, target the user's own backup destination. |

## 4. Custom skill — `plan-to-plane` (`/plan-to-plane`)

### Specification

- **Inputs:** plan/spec markdown (current document or pasted), Plane workspace + project from `~/.config/plane/key`.
- **Process:** parses plan into discrete tasks; previews proposed Plane issues with title, description, suggested labels.
- **Writes:** Plane issues via REST API after user confirms. Endpoint: `$PLANE_ENDPOINT/api/v1/workspaces/<ws>/projects/<proj>/issues/`.
- **Outputs:** list of created issue IDs + URLs.

### SKILL.md stub — `~/.claude/skills/plan-to-plane/SKILL.md`

```markdown
---
name: plan-to-plane
description: Parse a plan/spec markdown into discrete Plane issues, preview the proposed list, and create the issues via the Plane REST API after user confirmation. Triggered by /plan-to-plane.
---

Use this when the user has a plan document (or paste) and wants discrete tasks tracked in Plane.

Read the plan. Extract action items (typically headings, checklist items, or numbered steps). For each, propose a Plane issue with title, description, suggested labels. Show the full list. On confirmation, hit `$PLANE_ENDPOINT/api/v1/workspaces/<ws>/projects/<proj>/issues/` with the API key from `~/.config/plane/key`. Output the resulting issue IDs and URLs. Never auto-create — the preview-and-confirm step is non-skippable.
```

## 5. Working docs in Plane Pages

Project-scoped docs that don't go to memory:

| Document | When |
|---|---|
| Feature spec | Before implementation |
| Technical Design Doc (TDD) | Before non-trivial implementation |
| Sprint brief | Start of each cycle |
| PRD (product requirements) | Project kickoff |
| Post-mortem (full) | Immediately after an incident |

The post-mortem workflow is two-document — full doc to Plane Pages, 3-line lesson note to vault. The lesson-extraction skill is `postmortem` ([memory.md](memory.md) §8). The skill writes here when `$PLANE_ENDPOINT` is reachable, falls back to `docs/postmortems/` in the repo otherwise.

## 6. SessionStart integration

The vault `session-start.sh` hook ([memory.md](memory.md) §7.1) queries Plane for "open issues assigned to me" and injects them as context. The query uses `$PLANE_ENDPOINT` and the API key from `~/.config/plane/key`. If `$PLANE_ENDPOINT` is unreachable, the hook silently skips that section — no error, no block.

## 7. Cherry-picked skill references

`mattpocock/skills` contains `to-issues` (extract action items from conversation, file as GitHub issues) — direct shape for our `plan-to-plane` skill, retargeted from the GitHub API to the Plane API. See [skills.md](skills.md) §4 for the full cherry-pick strategy.

## 8. Open items

**Resolved:** endpoint config (`PLANE_ENDPOINT`), workspace shape, auth, Hetzner migration (out of scope).

**Still open — execution:**

- [ ] Pick a Plane release tag to pin (`v0.24.x` placeholder)
- [ ] First-run sequence: docker compose up → web UI signup → generate API key → write `~/.config/plane/key`
- [ ] Verify `plan-to-plane` API endpoint path against current Plane API version
