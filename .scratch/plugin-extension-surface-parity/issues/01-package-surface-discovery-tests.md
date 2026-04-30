# 01 — Package surface discovery tests (Wave A1)

Status: done
Risk tier: medium
Dependencies: —
File ownership:
- `src/cli/package-surfaces.test.ts`

Acceptance criteria:
- Repomix manifest includes `S/M/C/A/R/P` surfaces.
- Caveman manifest includes upstream package surfaces present in source (commands/hooks/rules/metadata when present).
- Cloudflare manifest includes skills, commands, MCP metadata, plugin metadata, assets.
- Superpowers manifest includes skills, commands, agents, hooks, package metadata, assets.
- Source backup files (`.original.md`, `.backup.md`) are not mirrorable surfaces.

## Comments
- Shipped in the parity series (`3d0dda3 feat(component): mirror package surfaces`).
