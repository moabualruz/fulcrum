---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, C1, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B9 secret management)
Docs: https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2
---

# GATED: vault-integration — HashiCorp Vault KV v2 + AWS Secrets Manager adapters

## What to build

Behind `FULCRUM_FEATURES=vault-integration`. `src/secrets/vault-adapter.ts`: per-provider adapter interface `SecretProvider { get(name): Promise<string>; set(name, value): Promise<void> }`. Providers: **HashiCorp Vault KV v2** — token auth (token from env `FULCRUM_VAULT_TOKEN`), endpoint from env `FULCRUM_VAULT_ADDR`; GET `v1/secret/data/fulcrum/<name>` + PUT; **AWS Secrets Manager** — `@aws-sdk/client-secrets-manager` MIT; credentials from env (AWS standard). `credentials.provider` column switches the path per credential: `'vault'` → Vault adapter; `'aws-sm'` → AWS adapter; `'local'` → existing nacl path. Web: `/settings/secrets → Vault tab` (Pillar 16 issue 26 pattern): endpoint + token/role config form; "Test connection" button. Doctor: `platform.keyring` check extended — if Vault unreachable + vault credentials exist → `fail` with recovery.

## Acceptance criteria

- [ ] Flag OFF: `credentials.get` uses local nacl path only; no Vault import loaded.
- [ ] Flag ON (Vault): `credentials.set('MY_KEY', 'sk-...')` with `provider='vault'` → PUT to Vault KV v2; `credentials.get('MY_KEY')` → GET from Vault → plaintext returned.
- [ ] Vault unreachable (network error) → `credentials.get` returns `{error: "VAULT_UNREACHABLE"}`; falls back to local value if `provider='local'` copy exists; doctor reports `platform.keyring: degraded`.
- [ ] Flag ON (AWS SM): `provider='aws-sm'` → `GetSecretValueCommand` called; mock AWS SDK returns value correctly.
- [ ] Mixed credentials: some with `provider='local'`, some `'vault'` → each routed to correct adapter.
- [ ] Web settings → Vault tab: endpoint + token form; "Test connection" → `credentials.testVault()` tRPC → success/failure message.
- [ ] Vitest: Vault adapter with mocked HTTP; AWS adapter with mocked SDK; fallback on unreachable.

## Blocked by

- Issue 02 (secrets keyring + vault) — base `credentials.*` tRPC + `src/secrets/vault.ts` abstraction.
