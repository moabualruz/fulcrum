---
Status: completed
Owner: codex-orchestrator
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C3]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [simple-git v3 — https://github.com/steveukx/git-js, nodegit fallback reference]
---

## What to build

`src/repos/git.ts` — a typed wrapper module around `simple-git` v3 exposing all git operations used by sync workers and tRPC procedures. All functions are pure (take a `localPath` or `mirrorPath`), Promise-based, and tested against a real fixture git repo created in the test setup. Failure gate: if any operation has no simple-git equivalent, implement via `git.raw([...])` and document why; if that is brittle, add a `nodegit` adapter for that single call only.

## Acceptance criteria

- [ ] `getStatus(path)` → `{ branch, dirty, ahead, behind, staged[], unstaged[] }`.
- [ ] `listBranches(path)` → `{ name, headSha, isDefault, isCurrent }[]` (local + remote).
- [ ] `createBranch(path, name, from?)` → void; throws if name already exists.
- [ ] `checkoutBranch(path, name)` → void.
- [ ] `deleteBranch(path, name, force?)` → void.
- [ ] `getCommitLog(path, { branch?, maxCount, offset })` → `{ sha, authorName, authorEmail, committedAt, subject, body, parents }[]`.
- [ ] `getCommitDiff(path, sha)` → raw patch string from `git show --stat --patch`.
- [ ] `getBlame(path, filePath, branch?)` → `{ sha, author, line, lineNo }[]`.
- [ ] `getFileTree(path, { branch?, dir? })` → `{ path, kind, sizeBytes }[]` from `git ls-tree`.
- [ ] `getFileContent(path, filePath, branch?)` → `{ content: string|Buffer, mimeType: string }` (MIME-sniffed via `file-type` or extension).
- [ ] `getStashList(path)` → `{ index, message, sha }[]`.
- [ ] Unit tests use a fixture git repo (created by test setup with `simple-git init + commit + branch`); each function covered by at least one RED→GREEN test.
- [ ] `nodegit` fallback path documented in module JSDoc with the gate condition.

## Blocked by

None - can start immediately
