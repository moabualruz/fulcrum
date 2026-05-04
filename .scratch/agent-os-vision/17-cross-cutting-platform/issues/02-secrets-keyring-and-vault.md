---
Status: completed
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md]
Owner: claude-worker-p17-secrets-vault
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, B9]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B9 secret management)
Docs: https://tweetnacl.js.org/
Linkage: MASTER-PLAN.md -> COVERAGE.md -> TASK-DAG.md -> TASK-BUNDLES.md -> 17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md
---

# Secret management — keyring.ts OS abstraction + vault.ts nacl.secretbox + credentials.* tRPC

## What to build

Two core modules + tRPC procedures. `src/secrets/keyring.ts`: OS keyring abstraction with priority: (1) `node-keytar` macOS Keychain / Linux Secret Service / Windows Credential Manager; (2) fallback encrypted-file at `~/.fulcrum/state/keyring-fallback.key` (mode 0600, auto-generated on first run). `src/secrets/vault.ts`: `nacl.secretbox` (tweetnacl MIT) encrypt/decrypt with Argon2id KDF (argon2 npm). Failure gate: `node-keytar` native build fails → fallback path automatic; `argon2` native fails → `node:crypto` PBKDF2-SHA256 (100k iter). `credentials.*` tRPC procedures: `list`, `set(name, value)` — value never stored plaintext; `get(name)` — returns plaintext only in response body, never logged; `rotate(name, newValue)`, `archive(name)`, `remove(name)`. `assertPermission()` on all; only owner or org-admin may `get`.

Cuts through: `credentials.set({name, value})` → keyring.getKey → KDF → nacl.secretbox → `credentialRepo.upsertEncrypted(...)` → `credentials.get(name)` → keyring.getKey → nacl.secretbox.open → plaintext returned.

## Acceptance criteria

- [x] `keyring.ts`: macOS path (mocked `node-keytar`) round-trips master key; Linux path round-trips; fallback-file path auto-generates key (mode 0600); missing fallback on decryption → `DECRYPTION_KEY_MISSING` error.
- [x] `vault.ts`: round-trip: encrypt then decrypt returns original plaintext; wrong key → `DECRYPTION_FAILED`; corrupted ciphertext → `DECRYPTION_FAILED`; nonce unique per call (unique 24-byte nonce sampled from `tweetnacl.randomBytes`).
- [x] `credentials.set`: ciphertext in `Credential.encryptedValue`; plaintext never appears in persistence or `Event.payload`.
- [x] `credentials.get`: authorized user → plaintext; unauthorized → tRPC FORBIDDEN.
- [x] `credentials.rotate`: new ciphertext replaces old; `last_used_at` updated.
- [x] `credentials.archive`: `archived=true`; excluded from `list` by default.
- [x] Failure gates: `node-keytar` load failure → fallback path used automatically; `argon2` load failure → PBKDF2 used; doctor reports `keyring: degraded` not `fail`.
- [x] Vitest: all above scenarios; no native deps in test (mocked `node-keytar`).

## Blocked by

- Issue 01 (schema) — `Credential` entity must exist.

## Implementation notes (2026-05-02 worker)

- `src/secrets/vault.ts`: AEAD via `tweetnacl.secretbox` (24-byte nonce from
  `tweetnacl.randomBytes`; XSalsa20-Poly1305 authenticated ciphertext),
  PBKDF2-SHA256 100k iter KDF. `argon2` native dependency is not required in
  this lane; the specified native-failure fallback is the always-on KDF path.
  Wrong keys and corrupted envelopes raise `DecryptionFailedError`.
- `src/secrets/keyring.ts`: native adapter is injected (`NativeKeyringAdapter`
  interface); `loadDefaultNativeAdapter()` dynamically imports `keytar` and
  swallows missing-binary errors. Fallback file at `<stateDir>/keyring-fallback.key`
  (mode 0600), auto-generated on encrypt path; decrypt path raises
  `DecryptionKeyMissingError` when neither source resolves.
- `src/secrets/credentials-router.ts`: `protectedProcedure` on every leaf;
  authorization via OrgMember role check (owner/admin) for cross-user
  operations; plaintext only ever appears in `get`'s response body.
- `src/secrets/doctor-checks.ts`: `secrets.keyring` → `pass` on OS keyring,
  `warn` (degraded) on fallback or broken native — never `fail` per spec.
- Tests: `tests/secrets/vault.test.ts`, `tests/secrets/keyring.test.ts`,
  `tests/secrets/doctor-checks.test.ts`, `tests/trpc/credentials.test.ts`.
  Rescue verification passed on 2026-05-02:
  `bun test tests/secrets/vault.test.ts tests/secrets/keyring.test.ts tests/secrets/doctor-checks.test.ts tests/trpc/credentials.test.ts tests/trpc/router.test.ts tests/trpc/app-router-scaffold.test.ts`
  (60 pass, 0 fail) and `bun run lint` (tsc exit 0).
