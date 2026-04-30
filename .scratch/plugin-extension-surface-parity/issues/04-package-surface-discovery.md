# 04 — Package surface discovery (Wave B1)

Status: done
Risk tier: medium
Dependencies: plugin-extension-surface-parity/01
File ownership:
- `src/cli/package-surfaces.ts`
- `src/cli/package-surfaces.test.ts`

Acceptance criteria:
- Deterministic discovery walks source directories per the manifest rules.
- SHA-256 hashing of every surface file.
- Mirror filtering excludes `.original.md`, `.backup.md`, `_archive`, `_template`, `.git`, `node_modules`, worktree dirs.
- Package source descriptors exist for Caveman, Repomix, Cloudflare, Superpowers.

## Comments
- Shipped via the parity series.
