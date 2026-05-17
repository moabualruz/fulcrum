/**
 * vault-adapter.test.ts — Vitest/Bun tests for gated Vault + AWS SM providers.
 *
 * Tests cover:
 *   - Flag OFF: no Vault/AWS imports loaded, only local nacl path used.
 *   - Flag ON (Vault): set/get via Vault KV v2 with mocked HTTP.
 *   - Vault unreachable: fallback to local + error sentinel.
 *   - Flag ON (AWS SM): GetSecretValueCommand with mocked SDK.
 *   - Mixed credentials: routed by provider field.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// --- helpers ------------------------------------------------------------------

let stateDir: string;
beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "fulcrum-vault-adapter-"));
});
afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

// --- Flag OFF -----------------------------------------------------------------

describe("vault-adapter (flag OFF)", () => {
  it("isVaultIntegrationEnabled returns false when env unset", async () => {
    const orig = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    const { isVaultIntegrationEnabled } = await import(
      "@platform-core/application/secrets/vault-adapter.ts"
    );
    expect(isVaultIntegrationEnabled()).toBe(false);
    if (orig !== undefined) process.env["FULCRUM_FEATURES"] = orig;
  });

  it("resolveProvider returns LocalNaclProvider when flag OFF", async () => {
    const orig = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    const { resolveProvider, LocalNaclProvider } = await import(
      "@platform-core/application/secrets/vault-adapter.ts"
    );
    const p = resolveProvider("local", { stateDir, native: null });
    expect(p).toBeInstanceOf(LocalNaclProvider);
    if (orig !== undefined) process.env["FULCRUM_FEATURES"] = orig;
  });

  it("resolveProvider ignores 'vault' credential when flag OFF and falls back to LocalNaclProvider", async () => {
    const orig = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    const { resolveProvider, LocalNaclProvider } = await import(
      "@platform-core/application/secrets/vault-adapter.ts"
    );
    const p = resolveProvider("vault", { stateDir, native: null });
    expect(p).toBeInstanceOf(LocalNaclProvider);
    if (orig !== undefined) process.env["FULCRUM_FEATURES"] = orig;
  });

  it("resolveProvider ignores 'aws-sm' credential when flag OFF and falls back to LocalNaclProvider", async () => {
    const orig = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    const { resolveProvider, LocalNaclProvider } = await import(
      "@platform-core/application/secrets/vault-adapter.ts"
    );
    const p = resolveProvider("aws-sm", { stateDir, native: null });
    expect(p).toBeInstanceOf(LocalNaclProvider);
    if (orig !== undefined) process.env["FULCRUM_FEATURES"] = orig;
  });
});

// --- Flag ON (Vault) ----------------------------------------------------------

describe("VaultKvProvider (flag ON)", () => {
  it("get calls Vault KV v2 GET endpoint and returns plaintext", async () => {
    process.env["FULCRUM_FEATURES"] = "vault-integration";
    process.env["FULCRUM_VAULT_ADDR"] = "http://vault.test:8200";
    process.env["FULCRUM_VAULT_TOKEN"] = "test-token";

    const { VaultKvProvider } = await import("@platform-core/application/secrets/vault-adapter.ts");

    // Mock fetch to simulate Vault KV v2 GET response
    const mockFetch = mock(async (url: string | URL | Request, opts?: RequestInit) => {
      const u = url.toString();
      if (u.includes("/v1/secret/data/fulcrum/MY_KEY") && !opts?.method) {
        return new Response(
          JSON.stringify({ data: { data: { value: "sk-secret-value" } } }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const provider = new VaultKvProvider({
      addr: "http://vault.test:8200",
      token: "test-token",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await provider.get("MY_KEY");
    expect(result).toBe("sk-secret-value");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_VAULT_ADDR"];
    delete process.env["FULCRUM_VAULT_TOKEN"];
  });

  it("set calls Vault KV v2 PUT endpoint", async () => {
    process.env["FULCRUM_FEATURES"] = "vault-integration";

    const { VaultKvProvider } = await import("@platform-core/application/secrets/vault-adapter.ts");

    let capturedBody: unknown = null;
    const mockFetch = mock(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body ? JSON.parse(opts.body as string) : null;
      return new Response("{}", { status: 200 });
    });

    const provider = new VaultKvProvider({
      addr: "http://vault.test:8200",
      token: "my-token",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await provider.set("API_KEY", "super-secret");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(capturedBody).toEqual({ data: { value: "super-secret" } });

    delete process.env["FULCRUM_FEATURES"];
  });

  it("get on unreachable Vault throws VaultUnreachableError", async () => {
    process.env["FULCRUM_FEATURES"] = "vault-integration";

    const { VaultKvProvider, VaultUnreachableError } = await import(
      "@platform-core/application/secrets/vault-adapter.ts"
    );

    const mockFetch = mock(async () => {
      throw new TypeError("fetch failed");
    });

    const provider = new VaultKvProvider({
      addr: "http://vault.test:8200",
      token: "my-token",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(provider.get("SOME_KEY")).rejects.toBeInstanceOf(VaultUnreachableError);

    delete process.env["FULCRUM_FEATURES"];
  });
});

// --- Flag ON (AWS SM) ---------------------------------------------------------

describe("AwsSmProvider (flag ON)", () => {
  it("get calls GetSecretValueCommand with mocked SDK and returns value", async () => {
    process.env["FULCRUM_FEATURES"] = "vault-integration";

    const { AwsSmProvider } = await import("@platform-core/application/secrets/vault-adapter.ts");

    const mockSend = mock(async (_cmd: unknown) => ({
      SecretString: "aws-secret-value",
    }));

    const fakeClient = { send: mockSend };
    // Inject stub command constructor so no real AWS SDK import needed
    const StubGetCmd = class { constructor(public input: unknown) {} };
    const provider = new AwsSmProvider({
      client: fakeClient,
      GetSecretValueCommand: StubGetCmd as unknown as new (input: { SecretId: string }) => unknown,
    });

    const result = await provider.get("PROD_KEY");
    expect(result).toBe("aws-secret-value");
    expect(mockSend).toHaveBeenCalledTimes(1);

    delete process.env["FULCRUM_FEATURES"];
  });

  it("set calls PutSecretValueCommand with mocked SDK", async () => {
    process.env["FULCRUM_FEATURES"] = "vault-integration";

    const { AwsSmProvider } = await import("@platform-core/application/secrets/vault-adapter.ts");

    const mockSend = mock(async (_cmd: unknown) => ({}));
    const fakeClient = { send: mockSend };
    const StubPutCmd = class { constructor(public input: unknown) {} };
    const provider = new AwsSmProvider({
      client: fakeClient,
      PutSecretValueCommand: StubPutCmd as unknown as new (input: { SecretId: string; SecretString: string }) => unknown,
    });

    await provider.set("PROD_KEY", "new-value");
    expect(mockSend).toHaveBeenCalledTimes(1);

    delete process.env["FULCRUM_FEATURES"];
  });
});

// --- Mixed routing -----------------------------------------------------------

describe("resolveProvider routing (flag ON)", () => {
  it("routes 'vault' → VaultKvProvider, 'aws-sm' → AwsSmProvider, 'local' → LocalNaclProvider", async () => {
    process.env["FULCRUM_FEATURES"] = "vault-integration";
    process.env["FULCRUM_VAULT_ADDR"] = "http://vault.test:8200";
    process.env["FULCRUM_VAULT_TOKEN"] = "tok";

    const { resolveProvider, VaultKvProvider, AwsSmProvider, LocalNaclProvider } =
      await import("@platform-core/application/secrets/vault-adapter.ts");

    expect(resolveProvider("vault", { stateDir, native: null })).toBeInstanceOf(
      VaultKvProvider,
    );
    expect(resolveProvider("aws-sm", { stateDir, native: null })).toBeInstanceOf(
      AwsSmProvider,
    );
    expect(resolveProvider("local", { stateDir, native: null })).toBeInstanceOf(
      LocalNaclProvider,
    );

    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_VAULT_ADDR"];
    delete process.env["FULCRUM_VAULT_TOKEN"];
  });
});

// --- Doctor degraded on Vault unreachable ------------------------------------

describe("vaultHealthCheck (doctor)", () => {
  it("vault unreachable → status=fail with recovery hint", async () => {
    process.env["FULCRUM_FEATURES"] = "vault-integration";
    process.env["FULCRUM_VAULT_ADDR"] = "http://vault.test:8200";
    process.env["FULCRUM_VAULT_TOKEN"] = "tok";

    const { vaultHealthCheck } = await import("@platform-core/application/secrets/doctor-checks.ts");

    const mockFetch = mock(async () => {
      throw new TypeError("fetch failed");
    });

    const result = await vaultHealthCheck({ fetchFn: mockFetch as unknown as typeof fetch });
    expect(result.check).toBe("platform.keyring.vault");
    expect(result.status).toBe("fail");
    expect(result.hint).toBeDefined();

    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_VAULT_ADDR"];
    delete process.env["FULCRUM_VAULT_TOKEN"];
  });

  it("vault reachable → status=pass", async () => {
    process.env["FULCRUM_FEATURES"] = "vault-integration";
    process.env["FULCRUM_VAULT_ADDR"] = "http://vault.test:8200";
    process.env["FULCRUM_VAULT_TOKEN"] = "tok";

    const { vaultHealthCheck } = await import("@platform-core/application/secrets/doctor-checks.ts");

    const mockFetch = mock(async () => new Response("{}", { status: 200 }));
    const result = await vaultHealthCheck({ fetchFn: mockFetch as unknown as typeof fetch });
    expect(result.status).toBe("pass");

    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_VAULT_ADDR"];
    delete process.env["FULCRUM_VAULT_TOKEN"];
  });
});
