# 10 — Refactor Caveman package (Wave C4)

Status: done
Risk tier: medium
Dependencies: plugin-extension-surface-parity/06
File ownership:
- `src/cli/install.ts`
- `src/cli/install.test.ts`
- `src/cli/uninstall.ts`
- `src/cli/uninstall.test.ts`

Acceptance criteria:
- Native Claude/Gemini installs preserved.
- Codex/OpenCode/Pi mirrors are manifest-driven and include plugin metadata/assets/hooks/config.
- Caveman config (`defaultMode: ultra`) is preserved across mirrors.

## Comments
- Shipped via `08b33d6 fix(packages): adapt mirrored skills and MCPs` and the install/uninstall hardening series.
