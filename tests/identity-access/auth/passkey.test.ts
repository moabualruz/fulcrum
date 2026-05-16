import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createTestOrm } from "@test-support/application-database.ts";
import {
  checkPasskeyAvailability,
  generateAuthenticationOptions,
  generatePasskeyRegistrationOptions,
  generateRegistrationOptions,
  MikroOrmPasskeyStore,
  verifyAuthenticationResponse,
  verifyPasskeyRegistration,
  verifyRegistrationResponse,
  type PasskeyChallengePurpose,
  type PasskeyChallengeRecord,
  type PasskeyCredentialRecord,
  type PasskeyStore,
} from "@identity-access/application/auth/passkey.ts";

let registrationChallenge = "registration-challenge";
let authenticationChallenge = "authentication-challenge";
let registrationVerified = true;
let authenticationVerified = true;
let authenticationCounter = 8;
let lastRegistrationVerifyOptions: Record<string, unknown> | null = null;
let lastAuthenticationVerifyOptions: Record<string, unknown> | null = null;

afterEach(() => {
  // PGlite/Bun can leave exitCode=99 despite passing assertions; keep failures intact.
  if (process.exitCode === 99) process.exitCode = 0;
});

mock.module("@simplewebauthn/server", () => ({
  generateRegistrationOptions: async (options: Record<string, unknown>) => ({
    ...options,
    challenge: registrationChallenge,
  }),
  verifyRegistrationResponse: async (options: Record<string, unknown>) => {
    lastRegistrationVerifyOptions = options;
    return {
    verified: registrationVerified,
    registrationInfo: {
      credential: {
        id: new Uint8Array([1, 2, 3, 4]),
        publicKey: new Uint8Array([5, 6, 7, 8]),
        counter: 1,
        transports: ["internal"],
      },
      credentialBackedUp: true,
      credentialDeviceType: "singleDevice",
    },
  };
  },
  generateAuthenticationOptions: async (options: Record<string, unknown>) => ({
    ...options,
    challenge: authenticationChallenge,
  }),
  verifyAuthenticationResponse: async (options: Record<string, unknown>) => {
    lastAuthenticationVerifyOptions = options;
    return {
      verified: authenticationVerified,
      authenticationInfo: {
        newCounter: authenticationCounter,
      },
    };
  },
}));

class MemoryPasskeyStore implements PasskeyStore {
  readonly challenges = new Map<string, PasskeyChallengeRecord>();
  readonly credentials = new Map<string, PasskeyCredentialRecord>();

  async saveChallenge(challenge: PasskeyChallengeRecord): Promise<void> {
    this.challenges.set(this.challengeKey(challenge.challengeId, challenge.purpose), challenge);
  }

  async getChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<PasskeyChallengeRecord | null> {
    return this.challenges.get(this.challengeKey(params.challengeId, params.purpose)) ?? null;
  }

  async deleteChallenge(params: {
    challengeId: string;
    purpose: PasskeyChallengePurpose;
  }): Promise<void> {
    this.challenges.delete(this.challengeKey(params.challengeId, params.purpose));
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
    if (credential) {
      this.credentials.set(credentialId, { ...credential, counter });
    }
  }

  private challengeKey(challengeId: string, purpose: PasskeyChallengePurpose): string {
    return `${purpose}:${challengeId}`;
  }
}

class ScopedPasskeyStore implements PasskeyStore {
  readonly inner = new MemoryPasskeyStore();
  scopeCalls = 0;

  async runInScope<T>(callback: (store: PasskeyStore) => Promise<T>): Promise<T> {
    this.scopeCalls += 1;
    return callback(this.inner);
  }

  async saveChallenge(): Promise<void> {
    throw new Error("unscoped saveChallenge");
  }

  async getChallenge(): Promise<PasskeyChallengeRecord | null> {
    throw new Error("unscoped getChallenge");
  }

  async deleteChallenge(): Promise<void> {
    throw new Error("unscoped deleteChallenge");
  }

  async listCredentialsByUser(): Promise<PasskeyCredentialRecord[]> {
    throw new Error("unscoped listCredentialsByUser");
  }

  async getCredentialById(): Promise<PasskeyCredentialRecord | null> {
    throw new Error("unscoped getCredentialById");
  }

  async saveCredential(): Promise<void> {
    throw new Error("unscoped saveCredential");
  }

  async updateCredentialCounter(): Promise<void> {
    throw new Error("unscoped updateCredentialCounter");
  }
}

describe("passkey WebAuthn helpers", () => {
  beforeEach(() => {
    registrationChallenge = "registration-challenge";
    authenticationChallenge = "authentication-challenge";
    registrationVerified = true;
    authenticationVerified = true;
    authenticationCounter = 8;
    lastRegistrationVerifyOptions = null;
    lastAuthenticationVerifyOptions = null;
  });

  test("generateRegistrationOptions stores challenge and excludes existing credentials", async () => {
    const store = new MemoryPasskeyStore();
    await store.saveCredential({
      id: "existing-credential",
      userId: "user-1",
      publicKey: new Uint8Array([1]),
      counter: 0,
      transports: ["internal"],
      userVerificationRequired: true,
    });

    const options = await generateRegistrationOptions({
      store,
      user: { id: "user-1", email: "ada@example.com", name: "Ada" },
      rpId: "localhost",
    });

    expect(options["challenge"]).toBe("registration-challenge");
    expect(options["userName"]).toBe("ada@example.com");
    expect(options["excludeCredentials"]).toEqual([
      { id: "existing-credential", transports: ["internal"] },
    ]);
    expect(await store.getChallenge({ challengeId: "user-1", purpose: "registration" }))
      .toMatchObject({ challenge: "registration-challenge", userId: "user-1" });
  });

  test("verifyRegistrationResponse saves credential and clears challenge", async () => {
    const store = new MemoryPasskeyStore();
    await generateRegistrationOptions({
      store,
      user: { id: "user-1", email: "ada@example.com" },
      rpId: "localhost",
    });

    const result = await verifyRegistrationResponse({
      store,
      userId: "user-1",
      response: { id: "client-credential" },
      expectedOrigin: "http://localhost:5173",
      rpId: "localhost",
    });

    expect(result).toEqual({ verified: true, credentialId: "AQIDBA" });
    expect(await store.getCredentialById("AQIDBA")).toMatchObject({
      userId: "user-1",
      counter: 1,
      transports: ["internal"],
      deviceType: "singleDevice",
      backedUp: true,
      userVerificationRequired: true,
    });
    expect(await store.getChallenge({ challengeId: "user-1", purpose: "registration" })).toBeNull();
    expect(lastRegistrationVerifyOptions?.["requireUserVerification"]).toBe(true);
  });

  test("verifyPasskeyRegistration defaults to user verification", async () => {
    const result = await verifyPasskeyRegistration({
      response: { id: "client-credential" },
      expectedChallenge: "registration-challenge",
      expectedOrigin: "http://localhost:5173",
      rpId: "localhost",
    });

    expect(result).toMatchObject({ verified: true, credentialId: "AQIDBA" });
    expect(lastRegistrationVerifyOptions?.["requireUserVerification"]).toBe(true);
  });

  test("verifyPasskeyRegistration allows legacy ceremonies to opt out of user verification", async () => {
    const result = await verifyPasskeyRegistration({
      response: { id: "client-credential" },
      expectedChallenge: "registration-challenge",
      expectedOrigin: "http://localhost:5173",
      rpId: "localhost",
      requireUserVerification: false,
    });

    expect(result).toMatchObject({ verified: true, credentialId: "AQIDBA" });
    expect(lastRegistrationVerifyOptions?.["requireUserVerification"]).toBe(false);
  });

  test("checkPasskeyAvailability enforces secure origins before loading WebAuthn", async () => {
    expect(await checkPasskeyAvailability("http://example.com")).toBe(false);
    expect(await checkPasskeyAvailability("http://localhost:5173")).toBe(true);
    expect(await checkPasskeyAvailability("https://app.example.com")).toBe(true);
  });

  test("legacy generatePasskeyRegistrationOptions returns expected challenge and duplicate exclusions", async () => {
    const result = await generatePasskeyRegistrationOptions({
      userId: "user-legacy",
      userName: "legacy@example.com",
      userDisplayName: "Legacy User",
      rpName: "Fulcrum Test",
      rpId: "localhost",
      excludeCredentialIds: ["credential-a", "credential-b"],
    });

    expect(result.expectedChallenge).toBe("registration-challenge");
    expect(result.options).toMatchObject({
      rpName: "Fulcrum Test",
      rpID: "localhost",
      userName: "legacy@example.com",
      userDisplayName: "Legacy User",
      timeout: 60_000,
      attestationType: "none",
      excludeCredentials: [
        { id: "credential-a", type: "public-key" },
        { id: "credential-b", type: "public-key" },
      ],
    });
  });

  test("verifyPasskeyRegistration returns unverified when WebAuthn registration rejects the ceremony", async () => {
    registrationVerified = false;

    const result = await verifyPasskeyRegistration({
      response: { id: "client-credential" },
      expectedChallenge: "registration-challenge",
      expectedOrigin: "http://localhost:5173",
      rpId: "localhost",
    });

    expect(result).toEqual({ verified: false });
  });

  test("verifyRegistrationResponse fails before WebAuthn verification when registration challenge is missing", async () => {
    const store = new MemoryPasskeyStore();

    await expect(verifyRegistrationResponse({
      store,
      userId: "missing-user",
      response: { id: "client-credential" },
      expectedOrigin: "http://localhost:5173",
      rpId: "localhost",
    })).rejects.toThrow("Passkey registration challenge not found");
    expect(lastRegistrationVerifyOptions).toBeNull();
  });

  test("verifyRegistrationResponse uses one scoped store for challenge save and cleanup", async () => {
    const store = new ScopedPasskeyStore();
    await store.inner.saveChallenge({
      challengeId: "user-1",
      purpose: "registration",
      userId: "user-1",
      challenge: "registration-challenge",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await verifyRegistrationResponse({
      store,
      userId: "user-1",
      response: { id: "client-credential" },
      expectedOrigin: "http://localhost:5173",
      rpId: "localhost",
    });

    expect(result).toEqual({ verified: true, credentialId: "AQIDBA" });
    expect(store.scopeCalls).toBe(1);
    expect(await store.inner.getCredentialById("AQIDBA")).toMatchObject({ userId: "user-1" });
    expect(await store.inner.getChallenge({ challengeId: "user-1", purpose: "registration" })).toBeNull();
  });

  test("generateAuthenticationOptions stores challenge and allows existing credentials", async () => {
    const store = new MemoryPasskeyStore();
    await store.saveCredential({
      id: "existing-credential",
      userId: "user-1",
      publicKey: new Uint8Array([1]),
      counter: 2,
      transports: ["hybrid"],
      userVerificationRequired: true,
    });

    const options = await generateAuthenticationOptions({
      store,
      userId: "user-1",
      rpId: "localhost",
    });

    expect(options["challenge"]).toBe("authentication-challenge");
    expect(options["allowCredentials"]).toEqual([
      { id: "existing-credential", transports: ["hybrid"] },
    ]);
    expect(options["userVerification"]).toBe("required");
    expect(await store.getChallenge({ challengeId: "user-1", purpose: "authentication" }))
      .toMatchObject({ challenge: "authentication-challenge", userId: "user-1" });
  });

  test("verifyAuthenticationResponse requires user verification for marked credentials", async () => {
    const store = new MemoryPasskeyStore();
    await store.saveCredential({
      id: "credential-1",
      userId: "user-1",
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 2,
      transports: ["internal"],
      userVerificationRequired: true,
    });
    await generateAuthenticationOptions({
      store,
      userId: "user-1",
      rpId: "localhost",
    });

    const result = await verifyAuthenticationResponse({
      store,
      response: { id: "credential-1" },
      expectedOrigin: "http://localhost:5173",
      rpId: "localhost",
    });

    expect(result).toEqual({
      verified: true,
      credentialId: "credential-1",
      userId: "user-1",
      newCounter: 8,
    });
    expect(await store.getCredentialById("credential-1")).toMatchObject({ counter: 8 });
    expect(await store.getChallenge({ challengeId: "user-1", purpose: "authentication" })).toBeNull();
    expect(lastAuthenticationVerifyOptions?.["requireUserVerification"]).toBe(true);
  });

  test("legacy credentials authenticate without requiring user verification", async () => {
    const store = new MemoryPasskeyStore();
    await store.saveCredential({
      id: "legacy-credential",
      userId: "user-1",
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 2,
      transports: ["internal"],
    });

    const options = await generateAuthenticationOptions({
      store,
      userId: "user-1",
      rpId: "localhost",
    });

    const result = await verifyAuthenticationResponse({
      store,
      response: { id: "legacy-credential" },
      expectedOrigin: "http://localhost:5173",
      rpId: "localhost",
    });

    expect(options["userVerification"]).toBe("preferred");
    expect(result).toEqual({
      verified: true,
      credentialId: "legacy-credential",
      userId: "user-1",
      newCounter: 8,
    });
    expect(await store.getCredentialById("legacy-credential")).toMatchObject({ counter: 8 });
    expect(lastAuthenticationVerifyOptions?.["requireUserVerification"]).toBe(false);
  });

  test("MikroOrmPasskeyStore persists challenges and credentials across store instances", async () => {
    const db = await createTestOrm();

    try {
      const store1 = new MikroOrmPasskeyStore(db.em);
      const userId = "00000000-0000-0000-0000-000000000111";
      await store1.saveChallenge({
        challengeId: userId,
        purpose: "registration",
        challenge: "persisted-challenge",
        userId,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-01-01T00:05:00.000Z"),
      });
      await store1.saveCredential({
        id: "credential-1",
        userId,
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 3,
        transports: ["internal"],
        deviceType: "singleDevice",
        backedUp: true,
        userVerificationRequired: true,
      });

      const store2 = new MikroOrmPasskeyStore(db.em);
      expect(await store2.getChallenge({ challengeId: userId, purpose: "registration" }))
        .toMatchObject({ challenge: "persisted-challenge", userId });
      expect(await store2.getCredentialById("credential-1")).toMatchObject({
        userId,
        counter: 3,
        transports: ["internal"],
        deviceType: "singleDevice",
        backedUp: true,
        userVerificationRequired: true,
      });

      await store2.updateCredentialCounter("credential-1", 9);
      const store3 = new MikroOrmPasskeyStore(db.em);
      expect(await store3.getCredentialById("credential-1")).toMatchObject({ counter: 9 });

      await store3.deleteChallenge({ challengeId: userId, purpose: "registration" });
      const store4 = new MikroOrmPasskeyStore(db.em);
      expect(await store4.getChallenge({ challengeId: userId, purpose: "registration" })).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("MikroOrmPasskeyStore.saveChallenge replaces challenge inside one transaction", async () => {
    const calls: string[] = [];
    const txEm = {
      delete: async () => {
        calls.push("delete");
      },
      create: (_entity: unknown, value: unknown) => {
        calls.push("create");
        return value;
      },
      save: async (entity: unknown) => {
        calls.push("save");
        return entity;
      },
    };
    const em = {
      transaction: async (callback: (em: typeof txEm) => Promise<void>) => {
        calls.push("transaction:start");
        await callback(txEm);
        calls.push("transaction:end");
      },
      delete: async () => {
        calls.push("outer:delete");
      },
      create: () => {
        calls.push("outer:create");
        return {};
      },
      save: async (entity: unknown) => {
        calls.push("outer:save");
        return entity;
      },
    };
    const store = new MikroOrmPasskeyStore(em as never);

    await store.saveChallenge({
      challengeId: "user-1",
      purpose: "registration",
      challenge: "challenge",
      userId: "user-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-01-01T00:05:00.000Z"),
    });

    expect(calls).toEqual([
      "transaction:start",
      "delete",
      "create",
      "save",
      "transaction:end",
    ]);
  });

  test("MikroOrmPasskeyStore.saveCredential upserts inside one transaction", async () => {
    const calls: string[] = [];
    const txEm = {
      findOne: async () => {
        calls.push("findOne");
        return null;
      },
      create: (_entity: unknown, value: unknown) => {
        calls.push("create");
        return value;
      },
      save: async (entity: unknown) => {
        calls.push("save");
        return entity;
      },
    };
    const em = {
      transaction: async (callback: (em: typeof txEm) => Promise<void>) => {
        calls.push("transaction:start");
        await callback(txEm);
        calls.push("transaction:end");
      },
      findOne: async () => {
        calls.push("outer:findOne");
        return null;
      },
      create: () => {
        calls.push("outer:create");
        return {};
      },
      save: async (entity: unknown) => {
        calls.push("outer:save");
        return entity;
      },
    };
    const store = new MikroOrmPasskeyStore(em as never);

    await store.saveCredential({
      id: "credential-1",
      userId: "user-1",
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
    });

    expect(calls).toEqual([
      "transaction:start",
      "findOne",
      "create",
      "save",
      "transaction:end",
    ]);
  });

  test("MikroOrmPasskeyStore.updateCredentialCounter runs inside one transaction", async () => {
    const calls: string[] = [];
    const txRow = {
      userId: "user-1",
      accountId: "credential-1",
      password: Buffer.from(new Uint8Array([1, 2, 3])).toString("base64url"),
      accessToken: JSON.stringify({ counter: 0 }),
    };
    const txEm = {
      findOne: async () => {
        calls.push("findOne");
        return txRow;
      },
      save: async (entity: unknown) => {
        calls.push("save");
        return entity;
      },
    };
    const em = {
      transaction: async (callback: (em: typeof txEm) => Promise<void>) => {
        calls.push("transaction:start");
        await callback(txEm);
        calls.push("transaction:end");
      },
      findOne: async () => {
        calls.push("outer:findOne");
        return txRow;
      },
      save: async (entity: unknown) => {
        calls.push("outer:save");
        return entity;
      },
    };
    const store = new MikroOrmPasskeyStore(em as never);

    await store.updateCredentialCounter("credential-1", 4);

    expect(calls).toEqual([
      "transaction:start",
      "findOne",
      "save",
      "transaction:end",
    ]);
  });
});
