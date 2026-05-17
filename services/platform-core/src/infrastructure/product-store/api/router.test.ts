import { describe, expect, test } from "bun:test";

import { isPublicApiEnabled } from "@fulcrum/server/api/feature-flags.ts";
import { authenticateApiKey, hashApiKey } from "@fulcrum/server/public-api/access-policy.ts";

describe("isPublicApiEnabled", () => {
  test("returns false when FULCRUM_FEATURES unset", () => {
    const old = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    expect(isPublicApiEnabled()).toBe(false);
    if (old !== undefined) process.env.FULCRUM_FEATURES = old;
  });

  test("returns true when FULCRUM_FEATURES includes public-api", () => {
    const old = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "other,public-api,another";
    expect(isPublicApiEnabled()).toBe(true);
    process.env.FULCRUM_FEATURES = old ?? "";
  });
});

describe("public API auth policy", () => {
  test("valid API key reaches the authenticated principal", async () => {
    const validHash = await hashApiKey("test-api-key");

    await expect(authenticateApiKey("Bearer test-api-key", {
      findApiKeyByHash: async (hash) => {
        if (hash !== validHash) return null;
        return { org_id: "org-1", user_id: "user-1" };
      },
    })).resolves.toEqual({
      ok: true,
      principal: { orgId: "org-1", userId: "user-1" },
    });
  });

  test("invalid API key is rejected", async () => {
    await expect(authenticateApiKey("Bearer invalid-key", {
      findApiKeyByHash: async () => null,
    })).resolves.toEqual({
      ok: false,
      status: 401,
      body: { error: "invalid API key" },
    });
  });
});
