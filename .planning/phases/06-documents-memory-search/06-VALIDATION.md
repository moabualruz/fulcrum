---
phase: 6
slug: documents-memory-search
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-05
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/components) + bun test (backend services) |
| **Config file** | `src/web/vitest.config.ts` + root `bunfig.toml` |
| **Quick run command** | `bun test --filter <pattern>` |
| **Full suite command** | `bun run ci` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test --filter <changed-module>`
- **After every plan wave:** Run `bun run ci`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DOC-01 | — | TipTap JSON round-trip lossless | integration | `bun test src/docs/editor.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | DOC-02 | — | Frontmatter form saves/loads all schemas | integration | `bun test src/docs/frontmatter.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | DOC-03 | — | KaTeX renders inline and block math | component | `vitest run src/web/src/lib/editor/katex.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | DOC-04 | — | Mermaid diagrams render in editor | component | `vitest run src/web/src/lib/editor/mermaid.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | DOC-06 | — | applyDelta reconstructs from steps | unit | `bun test src/docs/version-reconstructor.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | DOC-05 | — | Drag-drop tree reorder persists | integration | `vitest run src/web/src/lib/docs/tree.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | SRC-01 | — | SearchDocument has all expanded columns | unit | `bun test src/db/entities/search/SearchDocument.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 2 | SRC-02 | — | search.query tRPC returns ranked results | integration | `bun test src/trpc/routers/search.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-03 | 03 | 2 | SRC-04 | — | Orama search <100ms at 10k docs | perf | `vitest run src/web/src/lib/search/orama.bench.ts` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 2 | MEM-03 | — | FTS ranks project > global | unit | `bun test src/product-kernel/memory.test.ts` | ✅ | ⬜ pending |
| 06-04-02 | 04 | 2 | MEM-04 | — | Context bundle respects token budget | unit | `bun test src/product-kernel/context-bundle.test.ts` | ❌ W0 | ⬜ pending |
| 06-04-03 | 04 | 2 | MEM-05 | — | Hybrid scoring toggles on flag | unit | `bun test src/product-kernel/hybrid-scoring.test.ts` | ❌ W0 | ⬜ pending |
| 06-05-01 | 05 | 3 | SRC-07 | — | Cmd+K dispatches 10+ commands | component | `vitest run src/web/src/lib/components/command-palette/palette.test.ts` | ❌ W0 | ⬜ pending |
| 06-05-02 | 05 | 3 | DOC-09 | — | context_summary extracted on save | unit | `bun test src/docs/context-summary.test.ts` | ❌ W0 | ⬜ pending |
| 06-06-01 | 06 | 3 | SRC-09 | — | CLI search --json returns results | integration | `bun test src/cli/commands/search.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/docs/editor.test.ts` — TipTap round-trip stubs for DOC-01..04
- [ ] `src/docs/version-reconstructor.test.ts` — applyDelta step replay for DOC-06
- [ ] `src/product-kernel/context-bundle.test.ts` — context bundle assembly for MEM-04
- [ ] `src/web/src/lib/search/orama.bench.ts` — Orama perf benchmark for SRC-04
- [ ] `src/web/src/lib/docs/tree.test.ts` — tree drag-drop stubs for DOC-05
- [ ] `src/web/src/lib/components/command-palette/palette.test.ts` — palette dispatch stubs for SRC-07
- [ ] `src/web/src/lib/components/search/search.test.ts` — search page stubs for SRC-05/06
- [ ] `@orama/orama` package installed in `src/web/package.json`
- [ ] `@tiptap/extension-mathematics` installed in `src/web/package.json`
- [ ] `prosemirror-changeset` installed in `src/web/package.json`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| KaTeX renders visually correct | DOC-03 | Visual rendering verification | Open doc with `$E=mc^2$`, confirm renders as equation |
| Mermaid renders diagram | DOC-04 | Browser canvas rendering | Open doc with mermaid block, confirm SVG output |
| Drag-drop tree feels responsive | DOC-05 | UX feel/timing | Drag document in sidebar, confirm <200ms visual feedback |
| Cmd+K keyboard flow | SRC-07 | End-to-end keyboard interaction | Press Cmd+K, type query, arrow to result, enter |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
