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
  generateAuthenticationOptions: (opts: unknown) => Promise<unknown>;
  verifyAuthenticationResponse: (opts: unknown) => Promise<{ verified: boolean; authenticationInfo?: Record<string, unknown> }>;
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

export type PasskeyChallengePurpose = "registration" | "authentication";

export interface PasskeyChallengeRecord {
  challengeId: string;
  purpose: PasskeyChallengePurpose;
  challenge: string;
  userId?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface PasskeyCredentialRecord {
  id: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[];
  deviceType?: string;
  backedUp?: boolean;
}

export interface PasskeyStore {
  saveChallenge(challenge: PasskeyChallengeRecord): Promise<void>;
  getChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<PasskeyChallengeRecord | null>;
  deleteChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<void>;
  listCredentialsByUser(userId: string): Promise<PasskeyCredentialRecord[]>;
  getCredentialById(credentialId: string): Promise<PasskeyCredentialRecord | null>;
  saveCredential(credential: PasskeyCredentialRecord): Promise<void>;
  updateCredentialCounter(credentialId: string, counter: number): Promise<void>;
}

export interface PasskeyUser {
  id: string;
  email: string;
  name?: string;
}

class InMemoryPasskeyStore implements PasskeyStore {
  private readonly challenges = new Map<string, PasskeyChallengeRecord>();
  private readonly credentials = new Map<string, PasskeyCredentialRecord>();

  async saveChallenge(challenge: PasskeyChallengeRecord): Promise<void> {
    this.challenges.set(`${challenge.purpose}:${challenge.challengeId}`, challenge);
  }

  async getChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<PasskeyChallengeRecord | null> {
    return this.challenges.get(`${params.purpose}:${params.challengeId}`) ?? null;
  }

  async deleteChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<void> {
    this.challenges.delete(`${params.purpose}:${params.challengeId}`);
  }

  async listCredentialsByUser(userId: string): Promise<PasskeyCredentialRecord[]> {
    return [...this.credentials.values()].filter((credential) => credential.userId === userId);
  }

  async getCredentialById(credentialId: string): Promise<PasskeyCredentialRecord | null> {
    return this.credentials.get(credentialId) ?? null;
  }

  async saveCredential(credential: PasskeyCredentialRecord): Promise<void> {
    this.credentials.set(credential.id, credential);
  }

  async updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
    const credential = this.credentials.get(credentialId);
    if (credential) this.credentials.set(credentialId, { ...credential, counter });
  }
}

export const defaultPasskeyStore: PasskeyStore = new InMemoryPasskeyStore();

export async function generateRegistrationOptions(params: {
  store?: PasskeyStore;
  user: PasskeyUser;
  rpName?: string;
  rpId?: string;
  timeoutMs?: number;
  challengeTtlMs?: number;
}): Promise<Record<string, unknown>> {
  const store = params.store ?? defaultPasskeyStore;
  const { generateRegistrationOptions: generate } = await importSimpleWebAuthn();
  const credentials = await store.listCredentialsByUser(params.user.id);
  const options = await generate({
    rpName: params.rpName ?? "Fulcrum",
    rpID: params.rpId ?? "localhost",
    userID: new TextEncoder().encode(params.user.id),
    userName: params.user.email,
    userDisplayName: params.user.name ?? params.user.email,
    timeout: params.timeoutMs ?? 60_000,
    attestationType: "none",
    excludeCredentials: credentials.map((credential) => ({
      id: credential.id,
      ...(credential.transports ? { transports: credential.transports } : {}),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    supportedAlgorithmIDs: [-7, -257],
  }) as Record<string, unknown>;

  await store.saveChallenge({
    challengeId: params.user.id,
    purpose: "registration",
    userId: params.user.id,
    challenge: readChallenge(options),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + (params.challengeTtlMs ?? 5 * 60_000)),
  });
  return options;
}

export async function verifyRegistrationResponse(params: {
  store?: PasskeyStore;
  userId: string;
  response: Record<string, unknown>;
  expectedOrigin: string;
  rpId?: string;
}): Promise<{ verified: boolean; credentialId?: string }> {
  const store = params.store ?? defaultPasskeyStore;
  const challenge = await requireChallenge(store, params.userId, "registration");
  const { verifyRegistrationResponse: verify } = await importSimpleWebAuthn();
  const verification = await verify({
    response: params.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: params.rpId ?? "localhost",
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) return { verified: false };

  const info = verification.registrationInfo as unknown as Record<string, unknown>;
  const credential = readCredential(info);
  await store.saveCredential({
    id: credential.id,
    userId: params.userId,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports,
    deviceType: readString(info, "credentialDeviceType"),
    backedUp: readBoolean(info, "credentialBackedUp"),
  });
  await store.deleteChallenge({ challengeId: params.userId, purpose: "registration" });
  return { verified: true, credentialId: credential.id };
}

export async function generateAuthenticationOptions(params: {
  store?: PasskeyStore;
  userId?: string;
  challengeId?: string;
  rpId?: string;
  timeoutMs?: number;
  challengeTtlMs?: number;
}): Promise<Record<string, unknown>> {
  const store = params.store ?? defaultPasskeyStore;
  const { generateAuthenticationOptions: generate } = await importSimpleWebAuthn();
  const credentials = params.userId ? await store.listCredentialsByUser(params.userId) : [];
  const challengeId = params.challengeId ?? params.userId ?? "login";
  const options = await generate({
    rpID: params.rpId ?? "localhost",
    timeout: params.timeoutMs ?? 60_000,
    userVerification: "preferred",
    ...(credentials.length > 0 && {
      allowCredentials: credentials.map((credential) => ({
        id: credential.id,
        ...(credential.transports ? { transports: credential.transports } : {}),
      })),
    }),
  }) as Record<string, unknown>;

  await store.saveChallenge({
    challengeId,
    purpose: "authentication",
    userId: params.userId,
    challenge: readChallenge(options),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + (params.challengeTtlMs ?? 5 * 60_000)),
  });
  return options;
}

export async function verifyAuthenticationResponse(params: {
  store?: PasskeyStore;
  response: Record<string, unknown>;
  expectedOrigin: string;
  rpId?: string;
  challengeId?: string;
}): Promise<{
  verified: boolean;
  credentialId?: string;
  userId?: string;
  newCounter?: number;
}> {
  const store = params.store ?? defaultPasskeyStore;
  const credentialId = readResponseCredentialId(params.response);
  const credential = await store.getCredentialById(credentialId);
  if (!credential) return { verified: false };

  const challengeId = params.challengeId ?? credential.userId;
  const challenge = await requireChallenge(store, challengeId, "authentication");
  const { verifyAuthenticationResponse: verify } = await importSimpleWebAuthn();
  const verification = await verify({
    response: params.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: params.rpId ?? "localhost",
    credential: {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
    },
    requireUserVerification: false,
  });

  if (!verification.verified) return { verified: false };

  const newCounter = readNumber(verification.authenticationInfo, "newCounter", credential.counter);
  await store.updateCredentialCounter(credential.id, newCounter);
  await store.deleteChallenge({ challengeId, purpose: "authentication" });
  return {
    verified: true,
    credentialId: credential.id,
    userId: credential.userId,
    newCounter,
  };
}

async function requireChallenge(
  store: PasskeyStore,
  challengeId: string,
  purpose: PasskeyChallengePurpose,
): Promise<PasskeyChallengeRecord> {
  const challenge = await store.getChallenge({ challengeId, purpose });
  if (!challenge) throw new Error(`Passkey ${purpose} challenge not found`);
  if (challenge.expiresAt.getTime() <= Date.now()) {
    await store.deleteChallenge({ challengeId, purpose });
    throw new Error(`Passkey ${purpose} challenge expired`);
  }
  return challenge;
}

function readChallenge(options: unknown): string {
  if (!options || typeof options !== "object") throw new Error("Passkey options missing challenge");
  const challenge = (options as Record<string, unknown>)["challenge"];
  if (typeof challenge !== "string" || challenge.length === 0) {
    throw new Error("Passkey options missing challenge");
  }
  return challenge;
}

function readResponseCredentialId(response: Record<string, unknown>): string {
  const id = response["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Passkey response missing credential id");
  }
  return id;
}

function readCredential(info: Record<string, unknown>): {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[];
} {
  const raw = info["credential"];
  if (!raw || typeof raw !== "object") throw new Error("Passkey verification missing credential");
  const credential = raw as Record<string, unknown>;
  return {
    id: credentialIdToString(credential["id"]),
    publicKey: readBytes(credential, "publicKey"),
    counter: readNumber(credential, "counter", 0),
    transports: readStringArray(credential["transports"]),
  };
}

function credentialIdToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64url");
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString("base64url");
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64url");
  }
  throw new Error("Passkey verification missing credential id");
}

function readBytes(parent: Record<string, unknown>, key: string): Uint8Array {
  const value = parent[key];
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error(`Passkey verification missing ${key}`);
}

function readNumber(parent: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = parent?.[key];
  return typeof value === "number" ? value : fallback;
}

function readString(parent: Record<string, unknown>, key: string): string | undefined {
  const value = parent[key];
  return typeof value === "string" ? value : undefined;
}

function readBoolean(parent: Record<string, unknown>, key: string): boolean | undefined {
  const value = parent[key];
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}
