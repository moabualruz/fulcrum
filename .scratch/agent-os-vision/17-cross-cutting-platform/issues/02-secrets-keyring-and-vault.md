---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, B9]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B9 secret management)
Docs: https://tweetnacl.js.org/
---

# Secret management — keyring.ts OS abstraction + vault.ts nacl.secretbox + credentials.* tRPC

## What to build

Two core modules + tRPC procedures. `src/secrets/keyring.ts`: OS keyring abstraction with priority: (1) `node-keytar` macOS Keychain / Linux Secret Service / Windows Credential Manager; (2) fallback encrypted-file at `~/.fulcrum/state/keyring-fallback.key` (mode 0600, auto-generated on first run). `src/secrets/vault.ts`: `nacl.secretbox` (tweetnacl MIT) encrypt/decrypt with Argon2id KDF (argon2 npm). Failure gate: `node-keytar` native build fails → fallback path automatic; `argon2` native fails → `node:crypto` PBKDF2-SHA256 (100k iter). `credentials.*` tRPC procedures: `list`, `set(name, value)` — value never stored plaintext; `get(name)` — returns plaintext only in response body, never logged; `rotate(name, newValue)`, `archive(name)`, `remove(name)`. `assertPermission()` on all; only owner or org-admin may `get`.

Cuts through: `credentials.set({name, value})` → keyring.getKey → KDF → nacl.secretbox → `credentialRepo.upsertEncrypted(...)` → `credentials.get(name)` → keyring.getKey → nacl.secretbox.open → plaintext returned.

## Acceptance criteria

- [ ] `keyring.ts`: macOS path (mocked `node-keytar`) round-trips master key; Linux path round-trips; fallback-file path auto-generates key (mode 0600); missing fallback on decryption → `DECRYPTION_KEY_MISSING` error.
- [ ] `vault.ts`: round-trip: encrypt then decrypt returns original plaintext; wrong key → `DECRYPTION_FAILED`; corrupted ciphertext → `DECRYPTION_FAILED`; nonce unique per call (unique 24-byte nonce sampled from `tweetnacl.randomBytes`).
- [ ] `credentials.set`: ciphertext in `Credential.encryptedValue`; plaintext never appears in persistence or `Event.payload`.
- [ ] `credentials.get`: authorized user → plaintext; unauthorized → tRPC FORBIDDEN.
- [ ] `credentials.rotate`: new ciphertext replaces old; `last_used_at` updated.
- [ ] `credentials.archive`: `archived=true`; excluded from `list` by default.
- [ ] Failure gates: `node-keytar` load failure → fallback path used automatically; `argon2` load failure → PBKDF2 used; doctor reports `keyring: degraded` not `fail`.
- [ ] Vitest: all above scenarios; no native deps in test (mocked `node-keytar`).

## Blocked by

- Issue 01 (schema) — `Credential` entity must exist.
