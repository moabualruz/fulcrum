# 04 — Byte-stable Markdown/frontmatter on real fixtures

Status: ready-for-agent
Risk tier: medium
Severity: medium
Source findings: C4
Dependencies: —
File ownership:
- `src/product-kernel/markdown.ts`
- `src/product-kernel/markdown.test.ts`
- `src/product-kernel/markdown.fixtures/` (new)

Acceptance criteria:
- Add real fixtures under `src/product-kernel/markdown.fixtures/` that include: comments inside frontmatter, non-alphabetical key order, unknown/extra keys, multi-line scalars, and trailing whitespace in the body.
- `serializeKernelMarkdown(parseKernelMarkdown(input))` must equal `input` byte-for-byte for every fixture.
- `updateFrontmatterKeys(input, { key: value })` exists, mutates only the named keys, and preserves everything else.
- Replace `yaml.parse` + `yaml.stringify` with a frontmatter patcher that operates on the original frontmatter text region (preserve order, comments, scalar styles).
- `bun run ci` is green.
