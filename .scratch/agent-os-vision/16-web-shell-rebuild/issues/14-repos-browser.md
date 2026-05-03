# Issue 14 — Repos Browser Routes

**Status:** implemented

## Summary

Four SvelteKit routes for the repos browser feature:

- `/repos` — list table with sync button and stale >24h badge
- `/repos/[id]` — detail: branches, 10 recent commits, linked tasks via edges
- `/repos/[id]/files` — lazy file tree (git ls-tree) + content viewer with binary placeholder
- `/repos/[id]/commits` — paginated commit log at PAGE_SIZE=50, monospace SHA, author avatar

## Implementation notes

- All routes use direct PGlite DB queries (same pattern as existing routes)
- Git operations (branches, commits, file tree) use `node:child_process` `execFile` against `root_path`
- Git failures (missing repo, no commits) return empty arrays — never throw
- `@sveltejs/kit` `error()` used for 404 on unknown repo id
- Stale badge shown when `last_seen_at` > 24h ago
- File tree lazy: depth-1 by default; dirs expand client-side via `$state`
- Binary files detected by extension; placeholder shown, no content fetch
- Syntax highlighting: plain `<pre><code>` block (shiki not available in this project)
- Commit log pagination: `?page=N`, PAGE_SIZE=50 constant exported for tests
- Author avatar via `ui-avatars.com` fallback (no MD5/gravatar dependency needed)

## Tests

16 tests across 4 files — all green:
- `src/web/src/routes/repos/page.server.test.ts` — list load, empty list, ISO stamp, sync action
- `src/web/src/routes/repos/[id]/page.server.test.ts` — detail load, 404, git empty graceful
- `src/web/src/routes/repos/[id]/files/page.server.test.ts` — empty tree, binary flag, 404, real git tree
- `src/web/src/routes/repos/[id]/commits/page.server.test.ts` — PAGE_SIZE, empty commits, 404, real git pagination
