# 08 — Refactor Cloudflare package (Wave C2)

Status: done
Risk tier: medium
Dependencies: plugin-extension-surface-parity/06
File ownership:
- `src/cli/vendor-packages.ts`
- `src/cli/vendor-packages.test.ts`

Acceptance criteria:
- Native Claude plugin install preserved.
- Codex/Gemini/OpenCode/Pi receive supported package surfaces or explicit unsupported reasons.
- Cloudflare upstream skills are not duplicated by both standalone upstream sync and package mirror.

## Comments
- Shipped via parity series.
