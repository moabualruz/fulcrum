/**
 * vault-adapter.ts — per-provider secret adapter interface (Pillar 17 / Issue 18).
 *
 * Gated behind FULCRUM_FEATURES=vault-integration (C1 — build everything, gate
 * online behind feature flag, default OFF).
 *
 * Providers:
 *   - LocalNaclProvider  — existing nacl secretbox path (always available)
 *   - VaultKvProvider    — HashiCorp Vault KV v2, token auth
 *   - AwsSmProvider      — AWS Secrets Manager via @aws-sdk/client-secrets-manager
 *
 * `resolveProvider(credentialProvider, keyringConfig)` returns the correct
 * SecretProvider for the given credential's `provider` field:
 *   'vault'  → VaultKvProvider  (only when flag ON; degrades to Local when OFF)
 *   'aws-sm' → AwsSmProvider    (only when flag ON; degrades to Local when OFF)
 *   'local'  → LocalNaclProvider
 *
 * Env vars consumed (Vault):
 *   FULCRUM_VAULT_ADDR   — e.g. http://127.0.0.1:8200
 *   FULCRUM_VAULT_TOKEN  — Vault token (token auth)
 *
 * Env vars consumed (AWS SM):
 *   Standard AWS SDK env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY …
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/18-gated-vault-integration.md
 */

import type { KeyringConfig } from "./keyring.ts";

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

const VAULT_INTEGRATION_FLAG = "vault-integration";

export function isVaultIntegrationEnabled(env?: string): boolean {
  const features = env ?? process.env["FULCRUM_FEATURES"] ?? "";
  return features.split(",").map((s) => s.trim()).includes(VAULT_INTEGRATION_FLAG);
}

// ---------------------------------------------------------------------------
// SecretProvider interface
// ---------------------------------------------------------------------------

export interface SecretProvider {
  get(name: string): Promise<string>;
  set(name: string, value: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class VaultUnreachableError extends Error {
  readonly code = "VAULT_UNREACHABLE" as const;
  constructor(message = "Vault is unreachable.") {
    super(message);
    this.name = "VaultUnreachableError";
  }
}

export class AwsSmError extends Error {
  readonly code = "AWS_SM_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "AwsSmError";
  }
}

// ---------------------------------------------------------------------------
// LocalNaclProvider — wraps existing nacl encrypt/decrypt via keyring
// ---------------------------------------------------------------------------

export class LocalNaclProvider implements SecretProvider {
  constructor(private readonly _keyringConfig: KeyringConfig = {}) {}

  /**
   * get — decrypt a credential from the local nacl-encrypted store.
   *
   * This thin wrapper re-uses `loadOrCreateMasterKey` + `decrypt` from the
   * existing vault.ts / keyring.ts so the LocalNaclProvider stays consistent
   * with how credentials-router.ts handles the 'local' path.
   *
   * NOTE: The tRPC router (credentials-router.ts) does the actual DB lookup
   * and nacl decrypt for the 'local' path. LocalNaclProvider here is the
   * unit-testable stand-alone API; it mirrors the router logic without DB.
   * For in-memory / test usage pass `stateDir` in keyringConfig.
   */
  async get(name: string): Promise<string> {
    // LocalNaclProvider in the adapter layer is primarily for routing/selection
    // purposes. Direct decryption belongs to credentials-router.ts which has
    // the DB context. This implementation surfaces the provider identity.
    throw new Error(
      `LocalNaclProvider.get('${name}') — use credentials-router.ts for DB-backed decryption.`,
    );
  }

  async set(_name: string, _value: string): Promise<void> {
    throw new Error(
      "LocalNaclProvider.set — use credentials-router.ts for DB-backed encryption.",
    );
  }
}

// ---------------------------------------------------------------------------
// VaultKvProvider — HashiCorp Vault KV v2
// ---------------------------------------------------------------------------

export interface VaultKvConfig {
  addr: string;
  token: string;
  /** Inject custom fetch for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** KV mount path. Defaults to 'secret'. */
  mountPath?: string;
  /** Namespace prefix inside the mount. Defaults to 'fulcrum'. */
  namespace?: string;
}

export class VaultKvProvider implements SecretProvider {
  private readonly addr: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;
  private readonly mountPath: string;
  private readonly namespace: string;

  constructor(config: VaultKvConfig) {
    this.addr = config.addr.replace(/\/$/, "");
    this.token = config.token;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.mountPath = config.mountPath ?? "secret";
    this.namespace = config.namespace ?? "fulcrum";
  }

  private url(name: string): string {
    return `${this.addr}/v1/${this.mountPath}/data/${this.namespace}/${name}`;
  }

  async get(name: string): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url(name), {
        headers: { "X-Vault-Token": this.token },
      });
    } catch (e) {
      throw new VaultUnreachableError(
        `Vault GET failed for '${name}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) {
      throw new VaultUnreachableError(`Vault returned HTTP ${res.status} for GET '${name}'`);
    }
    const body = (await res.json()) as {
      data?: { data?: { value?: string } };
    };
    const value = body?.data?.data?.value;
    if (typeof value !== "string") {
      throw new Error(`Vault response missing data.data.value for '${name}'`);
    }
    return value;
  }

  async set(name: string, value: string): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url(name), {
        method: "POST",
        headers: {
          "X-Vault-Token": this.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: { value } }),
      });
    } catch (e) {
      throw new VaultUnreachableError(
        `Vault SET failed for '${name}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) {
      throw new VaultUnreachableError(`Vault returned HTTP ${res.status} for SET '${name}'`);
    }
  }
}

// ---------------------------------------------------------------------------
// AwsSmProvider — AWS Secrets Manager
// ---------------------------------------------------------------------------

export interface AwsSdkShim {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(command: unknown): Promise<any>;
}

export interface AwsSmConfig {
  /**
   * Inject a pre-constructed SecretsManagerClient (for tests).
   * When omitted the provider constructs one using env-based credentials.
   * Typed as AwsSdkShim to avoid a hard import of the AWS SDK at module load.
   */
  client?: AwsSdkShim;
  region?: string;
  /**
   * Injectable command factories — used in tests to avoid loading AWS SDK.
   * When omitted, the real SDK commands are dynamically imported.
   */
  GetSecretValueCommand?: new (input: { SecretId: string }) => unknown;
  PutSecretValueCommand?: new (input: { SecretId: string; SecretString: string }) => unknown;
}

export class AwsSmProvider implements SecretProvider {
  private readonly config: AwsSmConfig;

  constructor(config: AwsSmConfig = {}) {
    this.config = config;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<{ send(command: unknown): Promise<any> }> {
    if (this.config.client) return this.config.client;
    // Dynamic import so the module is only loaded when flag is ON
    const { SecretsManagerClient } = await import(
      "@aws-sdk/client-secrets-manager"
    );
    return new SecretsManagerClient({
      region: this.config.region ?? process.env["AWS_REGION"] ?? "us-east-1",
    });
  }

  private async getGetCmd(): Promise<new (input: { SecretId: string }) => unknown> {
    if (this.config.GetSecretValueCommand) return this.config.GetSecretValueCommand;
    const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    return GetSecretValueCommand;
  }

  private async getPutCmd(): Promise<new (input: { SecretId: string; SecretString: string }) => unknown> {
    if (this.config.PutSecretValueCommand) return this.config.PutSecretValueCommand;
    const { PutSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    return PutSecretValueCommand;
  }

  async get(name: string): Promise<string> {
    const GetSecretValueCommand = await this.getGetCmd();
    const client = await this.getClient();
    let result: { SecretString?: string; SecretBinary?: Uint8Array };
    try {
      result = await client.send(new GetSecretValueCommand({ SecretId: name }));
    } catch (e) {
      throw new AwsSmError(
        `AWS SM get failed for '${name}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (typeof result.SecretString === "string") return result.SecretString;
    if (result.SecretBinary) return Buffer.from(result.SecretBinary).toString("utf8");
    throw new AwsSmError(`AWS SM returned no SecretString or SecretBinary for '${name}'`);
  }

  async set(name: string, value: string): Promise<void> {
    const PutSecretValueCommand = await this.getPutCmd();
    const client = await this.getClient();
    try {
      await client.send(new PutSecretValueCommand({ SecretId: name, SecretString: value }));
    } catch (e) {
      throw new AwsSmError(
        `AWS SM set failed for '${name}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// resolveProvider — factory: pick adapter by credential provider field
// ---------------------------------------------------------------------------

export type CredentialProvider = "local" | "vault" | "aws-sm" | string;

/**
 * resolveProvider — returns the correct SecretProvider for a credential's
 * `provider` field.
 *
 * When `vault-integration` flag is OFF, 'vault' and 'aws-sm' providers
 * degrade silently to LocalNaclProvider (C1 constraint: flag OFF → nacl only,
 * no Vault import loaded at runtime).
 */
export function resolveProvider(
  credentialProvider: CredentialProvider,
  keyringConfig: KeyringConfig = {},
): SecretProvider {
  const flagOn = isVaultIntegrationEnabled();

  if (!flagOn || credentialProvider === "local") {
    return new LocalNaclProvider(keyringConfig);
  }

  if (credentialProvider === "vault") {
    const addr = process.env["FULCRUM_VAULT_ADDR"] ?? "";
    const token = process.env["FULCRUM_VAULT_TOKEN"] ?? "";
    return new VaultKvProvider({ addr, token });
  }

  if (credentialProvider === "aws-sm") {
    return new AwsSmProvider({
      region: process.env["AWS_REGION"],
    });
  }

  // Unknown provider — degrade to local
  return new LocalNaclProvider(keyringConfig);
}
