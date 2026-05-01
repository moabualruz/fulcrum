/**
 * Passkey (WebAuthn) enrollment helpers — server-side.
 *
 * Better-Auth v1.6.x does not ship a built-in passkey/WebAuthn plugin.
 * This module provides server-side passkey helpers using @simplewebauthn/server
 * as a standalone integration layer.
 *
 * Gates:
 *   - checkPasskeyAvailability(): returns false if running in a non-HTTPS context
 *     or if WebAuthn peer deps are not installed.
 *   - generatePasskeyRegistrationOptions(): wraps @simplewebauthn/server
 *     generateRegistrationOptions().
 *   - verifyPasskeyRegistration(): wraps verifyRegistrationResponse().
 *
 * C1: Passkey feature is shipped but gated — callers should check
 *     `checkPasskeyAvailability()` before using.
 * C6: No raw SQL — credential storage via MikroORM (when Account entity lands).
 *
 * NOTE: @simplewebauthn/server is an optional peer dep. If not installed,
 * checkPasskeyAvailability() returns false and all helpers throw with a
 * clear error message rather than crashing at import time.
 */

/** Result type for registration options generation. */
export interface PasskeyRegistrationOptions {
  challenge: string;
  rpName: string;
  rpId: string;
  userId: string;
  userName: string;
  timeout: number;
  attestationType: "none" | "indirect" | "direct";
}

/** Metadata stored server-side during registration challenge. */
export interface PasskeyChallengeState {
  userId: string;
  challenge: string;
  createdAt: Date;
}

/**
 * Check if the WebAuthn/passkey feature is available in this environment.
 *
 * Returns false when:
 *   - @simplewebauthn/server is not installed.
 *   - Running in a non-secure context (HTTP, not localhost).
 *
 * @param origin - The request origin (e.g. "https://app.example.com").
 */
export async function checkPasskeyAvailability(origin: string): Promise<boolean> {
  // Must be HTTPS or localhost
  const isSecure =
    origin.startsWith("https://") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1");

  if (!isSecure) return false;

  // Check if @simplewebauthn/server is available without crashing on missing dep.
  // Uses a Function constructor to avoid static TS2307 resolution of the module.
  try {
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    await new Function("s", "return import(s)")("@simplewebauthn/server");
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate WebAuthn registration options for a new passkey enrollment.
 *
 * @throws Error if @simplewebauthn/server is not installed.
 */
export async function generatePasskeyRegistrationOptions(params: {
  userId: string;
  userName: string;
  userDisplayName?: string;
  rpName?: string;
  rpId?: string;
  /** Previously registered credential IDs to exclude (prevent duplicates). */
  excludeCredentialIds?: string[];
}): Promise<{
  options: Record<string, unknown>;
  expectedChallenge: string;
}> {
  const { generateRegistrationOptions } = await importSimpleWebAuthn();

  const rpName = params.rpName ?? "Fulcrum";
  const rpId = params.rpId ?? "localhost";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = await (generateRegistrationOptions as any)({
    rpName,
    rpID: rpId,
    userID: new TextEncoder().encode(params.userId),
    userName: params.userName,
    userDisplayName: params.userDisplayName ?? params.userName,
    timeout: 60_000,
    attestationType: "none",
    excludeCredentials: (params.excludeCredentialIds ?? []).map((id) => ({
      id,
      type: "public-key",
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  }) as Record<string, unknown>;

  return {
    options,
    expectedChallenge: options["challenge"] as string,
  };
}

/**
 * Verify a WebAuthn registration response from the client.
 *
 * @throws Error if @simplewebauthn/server is not installed.
 * @throws Error if verification fails.
 */
export async function verifyPasskeyRegistration(params: {
  response: Record<string, unknown>;
  expectedChallenge: string;
  expectedOrigin: string;
  rpId?: string;
}): Promise<{
  verified: boolean;
  credentialId?: string;
  credentialPublicKey?: Uint8Array;
  counter?: number;
}> {
  const { verifyRegistrationResponse } = await importSimpleWebAuthn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const verification = await (verifyRegistrationResponse as any)({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: params.rpId ?? "localhost",
    requireUserVerification: false,
  }) as { verified: boolean; registrationInfo?: { credential: { id: Uint8Array; publicKey: Uint8Array; counter: number } } };

  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false };
  }

  return {
    verified: true,
    credentialId: Buffer.from(
      verification.registrationInfo.credential.id,
    ).toString("base64url"),
    credentialPublicKey: verification.registrationInfo.credential.publicKey,
    counter: verification.registrationInfo.credential.counter,
  };
}

// ─── Private helpers ────────────────────────────────────────────

interface SimpleWebAuthnServer {
  generateRegistrationOptions: (opts: unknown) => Promise<unknown>;
  verifyRegistrationResponse: (opts: unknown) => Promise<{ verified: boolean; registrationInfo?: { credential: { id: Uint8Array; publicKey: Uint8Array; counter: number } } }>;
}

async function importSimpleWebAuthn(): Promise<SimpleWebAuthnServer> {
  // Uses Function constructor to avoid static TS2307 "module not found" for the
  // optional peer dep @simplewebauthn/server. This is intentional: the module is
  // runtime-dynamic and may not be installed.
  try {
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    return await new Function("s", "return import(s)")("@simplewebauthn/server") as SimpleWebAuthnServer;
  } catch {
    throw new Error(
      "@simplewebauthn/server is not installed. " +
      "Run: bun add @simplewebauthn/server\n" +
      "Passkey features require this peer dependency.",
    );
  }
}
