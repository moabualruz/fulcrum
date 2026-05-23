# Secrets

Application-layer vocabulary for encrypting **Credential** payloads, sourcing the master key, and routing per-credential reads to local or remote secret backends.

## Language

**MasterKey**:
A 32-byte symmetric key sourced from the keyring that wraps every **Credential** envelope.
_Avoid_: encryption key, root key, vault key

**Envelope**:
A `nonce(24) ‖ ciphertext ‖ authTag(16)` byte layout produced by the nacl-secretbox AEAD path.
_Avoid_: blob, ciphertext, sealed payload

**Keyring**:
The abstraction that resolves a **MasterKey** from an OS secret store (`os`) or an encrypted file (`fallback`).
_Avoid_: key store, secret store

**NativeKeyringAdapter**:
A `{ getPassword, setPassword }` shim around node-keytar or `@napi-rs/keyring` that exposes the OS keyring.
_Avoid_: keytar, native module, OS shim

**FallbackKeyFile**:
The `<stateDir>/keyring-fallback.key` file (mode 0600) auto-generated when no **NativeKeyringAdapter** can supply a **MasterKey**.
_Avoid_: backup key, local key, file vault

**PlatformKeyringFlag**:
A `FULCRUM_FEATURES` token (`keyring-macos | keyring-linux | keyring-windows`) that forces a specific OS keyring path.
_Avoid_: os flag, platform toggle

**SecretProvider**:
A `{ get(name), set(name, value) }` adapter implementation that owns the read/write path for one credential backend.
_Avoid_: secrets backend, store, driver

**LocalNaclProvider**:
The **SecretProvider** that defers to the credentials transport adapter for DB-backed nacl decryption — selection-only, not a stand-alone store.
_Avoid_: local store, nacl backend

**VaultKvProvider**:
The **SecretProvider** that reads and writes HashiCorp Vault KV v2 at `<addr>/v1/<mount>/data/<namespace>/<name>` using a token.
_Avoid_: vault client, hvault, kv backend

**AwsSmProvider**:
The **SecretProvider** that calls AWS Secrets Manager via dynamically imported `@aws-sdk/client-secrets-manager` commands.
_Avoid_: aws backend, sm client

**CredentialProvider**:
The `'local' | 'vault' | 'aws-sm'` discriminator on a **Credential** that selects which **SecretProvider** `resolveProvider` returns.
_Avoid_: backend name, provider type

**VaultIntegrationFlag**:
The `vault-integration` token in `FULCRUM_FEATURES`; when OFF, every **CredentialProvider** other than `local` silently degrades to **LocalNaclProvider**.
_Avoid_: feature toggle, vault flag

## Relationships

- A **Keyring** produces exactly one **MasterKey** per call, tagged with status `os` or `fallback`.
- A **Keyring** consults a **NativeKeyringAdapter** first; on null/error it reads or writes the **FallbackKeyFile**.
- A **PlatformKeyringFlag** forces the **NativeKeyringAdapter** loader chain (node-keytar → `@napi-rs/keyring`); failure returns null, never throws.
- The nacl-secretbox AEAD path consumes a **MasterKey** and produces or opens an **Envelope** for one **Credential**.
- `resolveProvider(credentialProvider, keyringConfig)` returns a **SecretProvider** based on **CredentialProvider** plus **VaultIntegrationFlag** state.
- A **LocalNaclProvider** never decrypts directly — it signals routing to the credentials transport adapter that owns the DB lookup.
- Doctor checks (`platform.keyring`, `platform.keyring_mode`, `platform.keyring.vault`, `secrets.keyring`) report **Keyring** status and **VaultKvProvider** reachability.

## Example dialogue

> **Dev:** "If `FULCRUM_FEATURES` has `vault-integration` but the **Credential** has `provider='local'`, which **SecretProvider** runs?"
> **Domain expert:** "**LocalNaclProvider** — the flag only unlocks remote backends; `local` always routes through the credentials transport adapter and the nacl **Envelope**."
> **Dev:** "And if the **NativeKeyringAdapter** fails to load on macOS with `keyring-macos` set?"
> **Domain expert:** "The **Keyring** returns a **MasterKey** from the **FallbackKeyFile** with status `fallback`, and `platform.keyring` reports `warn` — never `fail`."

## Flagged ambiguities

- "vault" overlapped the local nacl-secretbox module (`vault.ts`) and the **VaultKvProvider** (HashiCorp Vault) — resolved: the local module is the AEAD primitive that produces an **Envelope**; **VaultKvProvider** is a remote **SecretProvider**.
- "keyring" overlapped the **Keyring** abstraction, the **NativeKeyringAdapter** shim, and the underlying OS service — resolved: **Keyring** is the resolver, **NativeKeyringAdapter** is the loaded binding, the OS service stays unnamed at this layer.
- "provider" overlapped **CredentialProvider** (the discriminator string on a **Credential**) and **SecretProvider** (the runtime adapter) — resolved: the string selects which adapter `resolveProvider` constructs.
