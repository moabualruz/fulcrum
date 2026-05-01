import { beforeEach, describe, expect, mock, test } from "bun:test";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type PasskeyChallengePurpose,
  type PasskeyChallengeRecord,
  type PasskeyCredentialRecord,
  type PasskeyStore,
} from "../../src/auth/passkey.ts";

let registrationChallenge = "registration-challenge";
let authenticationChallenge = "authentication-challenge";
let registrationVerified = true;
let authenticationVerified = true;
let authenticationCounter = 8;

mock.module("@simplewebauthn/server", () => ({
  generateRegistrationOptions: async (options: Record<string, unknown>) => ({
    ...options,
    challenge: registrationChallenge,
  }),
  verifyRegistrationResponse: async () => ({
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
  }),
  generateAuthenticationOptions: async (options: Record<string, unknown>) => ({
    ...options,
    challenge: authenticationChallenge,
  }),
  verifyAuthenticationResponse: async () => ({
    verified: authenticationVerified,
    authenticationInfo: {
      newCounter: authenticationCounter,
    },
  }),
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

describe("passkey WebAuthn helpers", () => {
  beforeEach(() => {
    registrationChallenge = "registration-challenge";
    authenticationChallenge = "authentication-challenge";
    registrationVerified = true;
    authenticationVerified = true;
    authenticationCounter = 8;
  });

  test("generateRegistrationOptions stores challenge and excludes existing credentials", async () => {
    const store = new MemoryPasskeyStore();
    await store.saveCredential({
      id: "existing-credential",
      userId: "user-1",
      publicKey: new Uint8Array([1]),
      counter: 0,
      transports: ["internal"],
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
    });
    expect(await store.getChallenge({ challengeId: "user-1", purpose: "registration" })).toBeNull();
  });

  test("generateAuthenticationOptions stores challenge and allows existing credentials", async () => {
    const store = new MemoryPasskeyStore();
    await store.saveCredential({
      id: "existing-credential",
      userId: "user-1",
      publicKey: new Uint8Array([1]),
      counter: 2,
      transports: ["hybrid"],
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
    expect(await store.getChallenge({ challengeId: "user-1", purpose: "authentication" }))
      .toMatchObject({ challenge: "authentication-challenge", userId: "user-1" });
  });

  test("verifyAuthenticationResponse updates counter and clears challenge", async () => {
    const store = new MemoryPasskeyStore();
    await store.saveCredential({
      id: "credential-1",
      userId: "user-1",
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 2,
      transports: ["internal"],
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
  });
});
