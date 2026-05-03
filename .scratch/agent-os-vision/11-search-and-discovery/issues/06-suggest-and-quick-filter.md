---
Status: implemented
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# search.suggest + quick-filter parser: prefix autocomplete + inline kind:/project:/assignee:/status:/tag: tokens

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-10, T11-12)

## What to build
Two complementary slices: `search.suggest` tRPC procedure (prefix autocomplete, top-5 title completions for partial token, scoped by optional kind); and `src/search/quick-filter-parser.ts` (client-side parser that extracts `kind:<x>`, `project:<slug>`, `assignee:me`, `status:<s>`, `tag:<t>` tokens from raw query string, returns `{ cleanQuery, filters }` object for injection into `search.query` call).

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: `search.suggest` returns `{ suggestions: string[] }` (top-5, ≤100ms p95); `quick-filter-parser` pure function — no DB call.
- [ ] Web surface: `Tab` in search bar accepts first suggestion; quick-filter tokens highlighted as chips in input; `kind:doc` + remaining query text shown separately.
- [ ] CLI command: `fulcrum search suggest "foo" --kind task --json` returns `{ suggestions: ["foobar","foobaz",...] }`.
- [ ] TUI screen: Cmd+K search mode shows completions below input; `Tab` accepts.
- [ ] Tests: `suggest` — partial token "foo" returns titles starting with "foo" across kinds; kind scope filters results; top-5 cap; `quick-filter-parser` — `"kind:doc foo bar"` → `{cleanQuery:"foo bar", filters:{kind:"doc"}}`; combined tokens; unknown key ignored; RED→GREEN.

## Blocked by
- `05-fts-query-ranking.md` — `search.query` as reference for filter shape.

## Notes / Tech-stack hints
- `suggest` query: `searchDocRepo.find({ orgId, ...(kind ? { kind } : {}), title: { $ilike: `${prefix}%` } }, { fields: ['title'], orderBy: { title: 'ASC' }, limit: 5 })` — MikroORM repository call, no raw SQL.
- Quick-filter parser: regex scan for `<key>:<value>` tokens before any whitespace-separated word; strip matched tokens from remaining query.
- `assignee:me` resolved server-side: parser passes `assignee: '$me'`; tRPC procedure resolves `$me` to `ctx.userId`.
