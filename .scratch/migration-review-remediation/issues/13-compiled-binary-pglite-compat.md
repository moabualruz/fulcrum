# 13 — Compiled binary PGlite compatibility

Status: ready-for-agent
Risk tier: high
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` C1
File ownership:
- `src/product-kernel/db/pglite.ts`
- `src/cli/product.ts`
- `src/cli/doctor.ts`
- `scripts/build-all.ts`

Acceptance criteria:
- `./dist/fulcrum-darwin-arm64 product init --json` succeeds end-to-end against a temp `FULCRUM_HOME`.
- The binary either bundles PGlite's data files via `--asset-naming` / `bun build --asset-naming` or falls back to a SQLite-backed engine when running inside a compiled binary; the chosen path is documented in code with a `Why:` comment.
- `bun run ci` stays green.
- A test asserts `openPglite` works when the host file system is the only writable surface (no cwd assumptions).

Reproduction:

```bash
TMP=$(mktemp -d)
FULCRUM_HOME="$TMP/.fulcrum" ./dist/fulcrum-darwin-arm64 product init --json
# fails today: ENOENT '/$bunfs/root/pglite.data'
```
