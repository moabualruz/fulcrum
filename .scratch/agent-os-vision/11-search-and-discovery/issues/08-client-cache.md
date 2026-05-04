---
Status: completed
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Client-side search cache: 50-query LRU, 60s TTL, mutation invalidation (Web + TUI/CLI in-process)

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-13)

## What to build
`src/search/cache.ts` — `SearchCache` class: in-memory LRU (Map-based, 50-entry max eviction), 60s TTL per entry, keyed on `(orgId, queryHash)` where `queryHash = SHA-256(text + JSON.stringify(filters))`. Exposed as singleton in Web (browser) and in-process (Bun for TUI/CLI). Mutation hooks: tRPC mutation middleware invalidates cache entries for `orgId` on any `tasks.*`, `docs.*`, `memories.*`, `artifacts.*`, `runs.*` mutation. Cache is read-through: check cache → miss → call tRPC → populate → return.

## Acceptance criteria
- [ ] Schema migration: N/A — in-memory only.
- [ ] tRPC procedure / module: `SearchCache` wraps `search.query` calls in `src/search/cache.ts`; imported by Web Svelte components and TUI search pane.
- [ ] Web surface: cmd+K search results served from cache on repeated query within 60s; cache miss triggers tRPC call; mutation clears cache.
- [ ] CLI command: `fulcrum search "foo" --json` (second call within 60s) returns cached result without DB query (verified via query count assertion in test).
- [ ] TUI screen: search pane shows "cached" badge (dev mode only) on cache hit; results immediate on cache hit.
- [ ] Tests: hit within TTL — no second DB call; evict at 50 entries (entry 51 evicts LRU); invalidated on mutation — cache miss after `tasks.update`; TTL expiry — miss after 60s (mock `Date.now`); RED→GREEN.

## Blocked by
- `05-fts-query-ranking.md` — `search.query` to wrap.

## Notes / Tech-stack hints
- LRU: `Map` preserves insertion order; on insert beyond 50, delete `map.keys().next().value`.
- TTL: store `{ result, expiresAt }` per entry; check `Date.now() > expiresAt` on get.
- Mutation middleware: tRPC `onSettled` middleware or Svelte `invalidate()` call on mutation success.
- In-process cache (TUI/CLI): same `SearchCache` class; instantiated as module singleton; process lifetime = session.
