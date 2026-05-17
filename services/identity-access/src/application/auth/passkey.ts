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
 * Callers should check `checkPasskeyAvailability()` before using passkey flows.
 * Credential storage uses TypeORM account and verification entities.
 *
 * NOTE: @simplewebauthn/server is an optional peer dep. If not installed,
 * checkPasskeyAvailability() returns false and all helpers throw with a
 * clear error message rather than crashing at import time.
 */

import type { DataSource, EntityManager } from "typeorm";

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
  requireUserVerification?: boolean;
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
    requireUserVerification: params.requireUserVerification ?? true,
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
  userVerificationRequired?: boolean;
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
  runInScope?<T>(callback: (store: PasskeyStore) => Promise<T>): Promise<T>;
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

export class TypeOrmPasskeyStore implements PasskeyStore {
  constructor(private readonly em: EntityManager) {}

  async saveChallenge(challenge: PasskeyChallengeRecord): Promise<void> {
    const Verification = await getVerificationClass();
    const identifier = challengeIdentifier(challenge.challengeId, challenge.purpose);
    await this.em.transaction(async (em) => {
      await em.delete(Verification, { identifier } as never as never);
      const row = em.create(Verification, {
        identifier,
        value: JSON.stringify({
          challenge: challenge.challenge,
          userId: challenge.userId,
          createdAt: challenge.createdAt.toISOString(),
        }),
        expiresAt: challenge.expiresAt,
        createdAt: challenge.createdAt,
        updatedAt: new Date(),
      } as never);
      await em.save(row);
    });
  }

  async getChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<PasskeyChallengeRecord | null> {
    const Verification = await getVerificationClass();
    const identifier = challengeIdentifier(params.challengeId, params.purpose);
    const row = await this.em.findOne(Verification, { where: { identifier } as never });
    if (!row) return null;
    const parsed = parseChallengeValue((row as { value: string }).value);
    return {
      challengeId: params.challengeId,
      purpose: params.purpose,
      challenge: parsed.challenge,
      userId: parsed.userId,
      createdAt: parsed.createdAt,
      expiresAt: (row as { expiresAt: Date }).expiresAt,
    };
  }

  async deleteChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<void> {
    const Verification = await getVerificationClass();
    await this.em.delete(Verification, {
      identifier: challengeIdentifier(params.challengeId, params.purpose),
    } as never as never);
  }

  async listCredentialsByUser(userId: string): Promise<PasskeyCredentialRecord[]> {
    const Account = await getAccountClass();
    const rows = await this.em.find(Account, {
      providerId: "passkey",
      userId,
    } as never);
    return rows.map(accountToCredential);
  }

  async getCredentialById(credentialId: string): Promise<PasskeyCredentialRecord | null> {
    const Account = await getAccountClass();
    const row = await this.em.findOne(Account, { where: {
      providerId: "passkey",
      accountId: credentialId,
    } as never });
    return row ? accountToCredential(row) : null;
  }

  async saveCredential(credential: PasskeyCredentialRecord): Promise<void> {
    const Account = await getAccountClass();
    await this.em.transaction(async (em) => {
      const existing = await em.findOne(Account, { where: {
        providerId: "passkey",
        accountId: credential.id,
      } as never });
      const now = new Date();
      const metadata = credentialMetadataToString(credential);
      if (existing) {
        Object.assign(existing, {
          userId: credential.userId,
          password: bytesToBase64Url(credential.publicKey),
          accessToken: metadata,
          updatedAt: now,
        });
        await em.save(existing);
      } else {
        const row = em.create(Account, {
          userId: credential.userId,
          providerId: "passkey",
          accountId: credential.id,
          password: bytesToBase64Url(credential.publicKey),
          accessToken: metadata,
          createdAt: now,
          updatedAt: now,
        } as never);
        await em.save(row);
      }
    });
  }

  async updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
    const Account = await getAccountClass();
    await this.em.transaction(async (em) => {
      const row = await em.findOne(Account, { where: {
        providerId: "passkey",
        accountId: credentialId,
      } as never });
      if (!row) return;
      const credential = accountToCredential(row);
      Object.assign(row, {
        accessToken: credentialMetadataToString({ ...credential, counter }),
        updatedAt: new Date(),
      });
      await em.save(row);
    });
  }
}

class LazyTypeOrmPasskeyStore implements PasskeyStore {
  private ormPromise: Promise<DataSource> | null = null;

  async saveChallenge(challenge: PasskeyChallengeRecord): Promise<void> {
    await this.runInScope((store) => store.saveChallenge(challenge));
  }

  async getChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<PasskeyChallengeRecord | null> {
    return this.runInScope((store) => store.getChallenge(params));
  }

  async deleteChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<void> {
    await this.runInScope((store) => store.deleteChallenge(params));
  }

  async listCredentialsByUser(userId: string): Promise<PasskeyCredentialRecord[]> {
    return this.runInScope((store) => store.listCredentialsByUser(userId));
  }

  async getCredentialById(credentialId: string): Promise<PasskeyCredentialRecord | null> {
    return this.runInScope((store) => store.getCredentialById(credentialId));
  }

  async saveCredential(credential: PasskeyCredentialRecord): Promise<void> {
    await this.runInScope((store) => store.saveCredential(credential));
  }

  async updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
    await this.runInScope((store) => store.updateCredentialCounter(credentialId, counter));
  }

  async runInScope<T>(callback: (store: PasskeyStore) => Promise<T>): Promise<T> {
    const dataSource = await this.dataSource();
    const em = dataSource.manager;
    return await callback(new TypeOrmPasskeyStore(em));
  }

  private async dataSource(): Promise<DataSource> {
    this.ormPromise ??= import("@platform-core/infrastructure/application-database/typeorm.config.ts")
      .then(({ initDataSource }) => initDataSource())
      .catch((error) => {
        this.ormPromise = null;
        throw error;
      });
    return this.ormPromise;
  }
}

export const defaultPasskeyStore: PasskeyStore = new LazyTypeOrmPasskeyStore();

async function withPasskeyStore<T>(
  store: PasskeyStore | undefined,
  callback: (scopedStore: PasskeyStore) => Promise<T>,
): Promise<T> {
  const resolvedStore = store ?? defaultPasskeyStore;
  return resolvedStore.runInScope
    ? resolvedStore.runInScope(callback)
    : callback(resolvedStore);
}

export async function generateRegistrationOptions(params: {
  store?: PasskeyStore;
  user: PasskeyUser;
  rpName?: string;
  rpId?: string;
  timeoutMs?: number;
  challengeTtlMs?: number;
}): Promise<Record<string, unknown>> {
  return withPasskeyStore(params.store, async (store) => {
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
        userVerification: "required",
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
  });
}

export async function verifyRegistrationResponse(params: {
  store?: PasskeyStore;
  userId: string;
  response: Record<string, unknown>;
  expectedOrigin: string;
  rpId?: string;
}): Promise<{ verified: boolean; credentialId?: string }> {
  return withPasskeyStore(params.store, async (store) => {
    const challenge = await requireChallenge(store, params.userId, "registration");
    const { verifyRegistrationResponse: verify } = await importSimpleWebAuthn();
    const verification = await verify({
      response: params.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: params.expectedOrigin,
      expectedRPID: params.rpId ?? "localhost",
      requireUserVerification: true,
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
      userVerificationRequired: true,
    });
    await store.deleteChallenge({ challengeId: params.userId, purpose: "registration" });
    return { verified: true, credentialId: credential.id };
  });
}

export async function generateAuthenticationOptions(params: {
  store?: PasskeyStore;
  userId?: string;
  challengeId?: string;
  rpId?: string;
  timeoutMs?: number;
  challengeTtlMs?: number;
}): Promise<Record<string, unknown>> {
  return withPasskeyStore(params.store, async (store) => {
    const { generateAuthenticationOptions: generate } = await importSimpleWebAuthn();
    const credentials = params.userId ? await store.listCredentialsByUser(params.userId) : [];
    const challengeId = params.challengeId ?? params.userId ?? "login";
    const options = await generate({
      rpID: params.rpId ?? "localhost",
      timeout: params.timeoutMs ?? 60_000,
      userVerification: authenticationUserVerificationPreference(credentials),
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
  });
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
  return withPasskeyStore(params.store, async (store) => {
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
      requireUserVerification: credential.userVerificationRequired === true,
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
  });
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

async function getAccountClass() {
  const { Account } = await import("@identity-access/infrastructure/database/entities/auth/Account.ts");
  return Account;
}

async function getVerificationClass() {
  const { Verification } = await import("@identity-access/infrastructure/database/entities/auth/Verification.ts");
  return Verification;
}

function challengeIdentifier(challengeId: string, purpose: PasskeyChallengePurpose): string {
  return `passkey:${purpose}:${challengeId}`;
}

function parseChallengeValue(value: string): {
  challenge: string;
  userId?: string;
  createdAt: Date;
} {
  const parsed = JSON.parse(value) as {
    challenge?: unknown;
    userId?: unknown;
    createdAt?: unknown;
  };
  if (typeof parsed.challenge !== "string") {
    throw new Error("Stored passkey challenge is invalid");
  }
  return {
    challenge: parsed.challenge,
    userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
    createdAt: typeof parsed.createdAt === "string" ? new Date(parsed.createdAt) : new Date(0),
  };
}

function accountToCredential(row: unknown): PasskeyCredentialRecord {
  const account = row as {
    userId: string;
    accountId: string;
    password?: string | null;
    accessToken?: string | null;
  };
  if (!account.password) throw new Error("Stored passkey credential is missing public key");
  const metadata = parseCredentialMetadata(account.accessToken);
  return {
    id: account.accountId,
    userId: account.userId,
    publicKey: base64UrlToBytes(account.password),
    counter: metadata.counter,
    transports: metadata.transports,
    deviceType: metadata.deviceType,
    backedUp: metadata.backedUp,
    userVerificationRequired: metadata.userVerificationRequired,
  };
}

function credentialMetadataToString(credential: Pick<
  PasskeyCredentialRecord,
  "counter" | "transports" | "deviceType" | "backedUp" | "userVerificationRequired"
>): string {
  return JSON.stringify({
    counter: credential.counter,
    transports: credential.transports,
    deviceType: credential.deviceType,
    backedUp: credential.backedUp,
    userVerificationRequired: credential.userVerificationRequired,
  });
}

function parseCredentialMetadata(value: string | null | undefined): Pick<
  PasskeyCredentialRecord,
  "counter" | "transports" | "deviceType" | "backedUp" | "userVerificationRequired"
> {
  if (!value) return { counter: 0 };
  const parsed = JSON.parse(value) as {
    counter?: unknown;
    transports?: unknown;
    deviceType?: unknown;
    backedUp?: unknown;
    userVerificationRequired?: unknown;
  };
  return {
    counter: typeof parsed.counter === "number" ? parsed.counter : 0,
    transports: readStringArray(parsed.transports),
    deviceType: typeof parsed.deviceType === "string" ? parsed.deviceType : undefined,
    backedUp: typeof parsed.backedUp === "boolean" ? parsed.backedUp : undefined,
    userVerificationRequired: typeof parsed.userVerificationRequired === "boolean"
      ? parsed.userVerificationRequired
      : undefined,
  };
}

function authenticationUserVerificationPreference(
  credentials: PasskeyCredentialRecord[],
): "preferred" | "required" {
  return credentials.length > 0 && credentials.every((credential) => credential.userVerificationRequired === true)
    ? "required"
    : "preferred";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}
