# 15 — Frontmatter byte stability

Status: ready-for-agent
Risk tier: high
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` C4
File ownership:
- `src/product-kernel/markdown.ts`
- `src/product-kernel/markdown.test.ts`

Acceptance criteria:
- `serializeKernelMarkdown(parseKernelMarkdown(input)) === input` byte-stable for at least three real fixtures (canonical fixture + two with comments + unknown keys + custom scalar styles).
- Implementation uses a frontmatter patcher that updates only known keys and preserves original spans (no naive `parse → stringify`).
- RED first; GREEN; refactor pass with no regressions.
