# 03 — Markdown and frontmatter kernel

Status: ready-for-agent
Risk tier: low
Dependencies: —
File ownership:
- `src/product-kernel/markdown.ts`
- `src/product-kernel/markdown.test.ts`
- `package.json` (add `yaml`)

Acceptance criteria:
- `parseKernelMarkdown(input)` returns `{ frontmatter, body }`.
- `serializeKernelMarkdown(doc)` is a byte-stable inverse on the canonical fixture in `.scratch/product-kernel/PRD.md` Task 3.
- RED test exists: skeleton throws `not implemented`; test fails on missing behavior, not on import errors.
- GREEN: `bun test src/product-kernel/markdown.test.ts` passes.
- No model/embedding dependency introduced.

Failure gate: if key order, comments, unknown keys, or body content cannot be preserved on real fixtures, switch to a frontmatter patcher that updates only known keys; document the limitation in code.
