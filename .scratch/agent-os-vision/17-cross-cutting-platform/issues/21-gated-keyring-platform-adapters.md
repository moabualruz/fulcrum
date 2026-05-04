---
Status: completed
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, C1, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B9 secret management)
Docs: https://github.com/atom/node-keytar
---

# GATED: keyring-macos, keyring-linux, keyring-windows — platform keyring activation + doctor integration

## What to build

Three per-platform gated flags that activate native OS keyring adapters (which are auto-detected but gated to allow override). `keyring-macos` (`FULCRUM_FEATURES=keyring-macos`): ensures `node-keytar` macOS Keychain path is used even if auto-detection fails (explicit opt-in); adds Keychain permission prompt on first use. `keyring-linux`: enables `node-keytar` D-Bus Secret Service path; on systems without D-Bus, stays degraded. `keyring-windows`: enables `node-keytar` Windows Credential Manager path. Each flag: if `node-keytar` native addon fails to load → log build failure instructions → fall back to `keyring-fallback.key` path automatically (existing behavior). Doctor checks per platform: `platform.keyring` (pass if native active); `platform.keyring_mode` (warn if fallback active).

`src/secrets/keyring.ts` already has fallback; this issue adds explicit per-platform activation logic and doctor messaging.

## Acceptance criteria

- [ ] `keyring-macos` OFF: `keyring.ts` uses auto-detect (existing behavior); flag ON: forces Keychain path even if auto-detect would have skipped it.
- [ ] `node-keytar` load failure on any platform → automatic fallback to `keyring-fallback.key`; no process crash; doctor `platform.keyring_mode: warn` with "Install node-keytar to use native keyring" message.
- [ ] `keyring-fallback.key` created mode 0600 on first fallback use; `stat()` verified in test.
- [ ] Doctor: `platform.keyring: pass` when native keyring active; `platform.keyring: warn` (not fail) when fallback in use (user can still use Fulcrum, just with file-based key).
- [ ] All three platform adapters: unit test with mocked `node-keytar` for success path + load-failure path.
- [ ] `fulcrum secrets init-keyring` CLI command (recovery action): attempts to reload native module; prints diagnostic on failure.
- [ ] `@napi-rs/keyring` (MIT) as drop-in fallback if `node-keytar` deprecated; factory in `keyring.ts` tries `node-keytar` then `@napi-rs/keyring`.

## Blocked by

- Issue 02 (secrets keyring + vault) — `keyring.ts` base abstraction must exist.
