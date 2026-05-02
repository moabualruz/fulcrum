---
Status: ready-for-agent
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 10-iteration-loop-hard-cap
---

# Transcript JSONL capture + workspace diff capture

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Implement two capture subsystems in `sandbox-runner.ts`. (1) Transcript: pipe agent stdout/stderr to `<workspace_root>/transcripts/<run_id>.jsonl`; each line must be valid JSON; enforce `FULCRUM_MAX_TRANSCRIPT_SIZE` (50MB default) with truncation + `{truncated:true}` sentinel line; write `transcript_path` to `agent_runs`. (2) Workspace diff: after run completes, run `git diff HEAD` via `simple-git` on the worktree; write result to `<workspace_root>/diffs/<run_id>.diff`; update `workspace_diff_path` on `agent_runs`.

## Acceptance criteria

- [ ] Adapter / profile: `transcripts/<run_id>.jsonl` file created during run; each line parses as valid JSON (content + metadata fields); file closed and path written to `agent_runs.transcript_path` after run.
- [ ] Lifecycle integration: `FULCRUM_MAX_TRANSCRIPT_SIZE` enforced; when limit reached, truncation stops writing new lines, appends `{"truncated":true,"run_id":"..."}` as final line, sets `agent_runs.transcript_truncated = true` (add column if not in migration).
- [ ] Lifecycle integration: `diffs/<run_id>.diff` written via `simple-git` `diff('HEAD')`; `agent_runs.workspace_diff_path` updated; empty diff produces an empty file (not an error).
- [ ] Surfaces parity: `fulcrum runs <id> logs` reads and streams the JSONL file; `--follow` tails live during active run; `runs.getLogs` tRPC paginated procedure works against the JSONL file.
- [ ] Tests: test with stub agent writing known stdout lines — assert JSONL file contents; test size-cap truncation with a small cap; test diff written after stub agent modifies a file in worktree; test empty diff on no-change run.

## Blocked by

10-iteration-loop-hard-cap

## Notes

JSONL format per line: `{"ts": <ISO timestamp>, "stream": "stdout"|"stderr", "text": "<line>"}`. The `transcript_truncated` column may need a follow-up migration if not added in slice 02 — add it in this slice's migration if absent. `simple-git` is already a listed dependency; no new package needed.
