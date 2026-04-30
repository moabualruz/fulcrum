# 05 — Replace ad-hoc product CLI parsing with a tested parser

Status: ready-for-agent
Risk tier: low
Severity: medium
Source findings: C6
Dependencies: —
File ownership:
- `src/cli/product.ts`
- `src/cli/product.test.ts`
- `src/cli/argv.ts` (new)
- `src/cli/argv.test.ts` (new)

Acceptance criteria:
- Add a small tested `parseFlags(argv)` helper that distinguishes positionals from `--flag value` and `--flag=value`.
- `fulcrum product search --org-slug default kernel` parses query=`kernel`, orgSlug=`default`.
- `fulcrum product search kernel --org-slug default` parses identically.
- `fulcrum product search --json --limit 5 kernel` works: `query=kernel`, `json=true`, `limit=5`.
- `--` terminator is honored: arguments after `--` are positionals even if they start with `--`.
- Existing `product` CLI tests still pass; new tests cover the cases above.
- `bun run ci` is green.
