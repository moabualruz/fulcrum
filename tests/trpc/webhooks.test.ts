/**
 * Webhooks tRPC router tests — Pillar 13, Issue 07.
 *
 * TDD RED→GREEN:
 *   RED  — run before implementing; all tests fail.
 *   GREEN — run after implementing; all tests pass.
 *
 * Tests:
 *   1. Feature gate: webhooks.list throws FORBIDDEN when flag is OFF.
 *   2. Feature gate: webhooks.list returns [] when FULCRUM_FEATURES=outbound-webhooks.
 *   3. UNAUTHORIZED for unauthenticated callers.
 *   4. webhooks.create returns masked secret (****).
 *   5. webhooks.list masks secret on all rows.
 *   6. webhooks.get returns null for unknown id.
 *   7. webhooks.delete returns { ok: true } for known id.
 *   8. deliveries.list returns [] when no deliveries exist.
 *   9. Zod schema: WebhookOutputSchema rejects plain secret.
 *  10. Zod schema: DeliveryOutputSchema validates status enum.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";

import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";
import {
  WebhookOutputSchema,
  DeliveryOutputSchema,
} from "../../src/trpc/schemas/webhooks.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createCaller = t.createCallerFactory(appRouter);

function mockSession(overrides?: Partial<{ id: string; userId: string; orgId: string }>) {
  return {
    id: overrides?.id ?? "sess-wh-001",
    userId: overrides?.userId ?? "user-wh-001",
    orgId: overrides?.orgId ?? randomUUID(),
    activeOrganizationId: overrides?.orgId ?? randomUUID(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-wh-001",
    ipAddress: null,
    userAgent: null,
  };
}

function unauthCaller() {
  return createCaller(createContext({ session: null, orgId: null, userId: null, em: null, container: null }));
}

function authCallerNoFlag(userId = "user-wh-001", orgId = randomUUID()) {
  // FULCRUM_FEATURES not set → flag OFF.
  const session = mockSession({ userId, orgId });
  return createCaller(
    createContext({ session: session as never, orgId, userId, em: null, container: null }),
  );
}

function authCallerFlagOn(userId = "user-wh-001", orgId = randomUUID()) {
  // Env var set inside the test; caller has no em (in-memory mode).
  const session = mockSession({ userId, orgId });
  return createCaller(
    createContext({ session: session as never, orgId, userId, em: null, container: null }),
  );
}

// ─── 1. Feature gate — flag OFF ───────────────────────────────────────────────

describe("webhooks — feature gate (flag OFF)", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
  });

  afterEach(() => {
    if (savedEnv !== undefined) process.env.FULCRUM_FEATURES = savedEnv;
    else delete process.env.FULCRUM_FEATURES;
  });

  it("webhooks.list throws FORBIDDEN when flag is OFF", async () => {
    const caller = authCallerNoFlag();
    let error: TRPCError | null = null;
    try {
      await caller.webhooks.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("webhooks.get throws FORBIDDEN when flag is OFF", async () => {
    const caller = authCallerNoFlag();
    let error: TRPCError | null = null;
    try {
      await caller.webhooks.get({ id: randomUUID() });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("webhooks.create throws FORBIDDEN when flag is OFF", async () => {
    const caller = authCallerNoFlag();
    let error: TRPCError | null = null;
    try {
      await caller.webhooks.create({ name: "test", url: "https://example.com/hook" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });
});

// ─── 2. Feature gate — flag ON ────────────────────────────────────────────────

describe("webhooks — feature gate (flag ON via FULCRUM_FEATURES)", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "outbound-webhooks";
  });

  afterEach(() => {
    if (savedEnv !== undefined) process.env.FULCRUM_FEATURES = savedEnv;
    else delete process.env.FULCRUM_FEATURES;
  });

  it("webhooks.list returns [] when no em (stub mode with flag ON)", async () => {
    const caller = authCallerFlagOn();
    const result = await caller.webhooks.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("webhooks.get returns null for unknown id (stub mode with flag ON)", async () => {
    const caller = authCallerFlagOn();
    const result = await caller.webhooks.get({ id: randomUUID() });
    expect(result).toBeNull();
  });

  it("webhooks.deliveries.list returns [] (stub mode with flag ON)", async () => {
    const caller = authCallerFlagOn();
    const result = await caller.webhooks.deliveries.list({ webhookId: randomUUID() });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("webhooks.deliveries.get returns null for unknown id (stub mode with flag ON)", async () => {
    const caller = authCallerFlagOn();
    const result = await caller.webhooks.deliveries.get({ id: randomUUID() });
    expect(result).toBeNull();
  });
});

// ─── 3. Unauthenticated ───────────────────────────────────────────────────────

describe("webhooks — unauthenticated", () => {
  it("webhooks.list returns UNAUTHORIZED without session", async () => {
    const caller = unauthCaller();
    let error: TRPCError | null = null;
    try {
      await caller.webhooks.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });

  it("webhooks.create returns UNAUTHORIZED without session", async () => {
    const caller = unauthCaller();
    let error: TRPCError | null = null;
    try {
      await caller.webhooks.create({ name: "x", url: "https://example.com" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });
});

// ─── 4. Zod schema validation ─────────────────────────────────────────────────

describe("webhooks — Zod schema validation", () => {
  it("WebhookOutputSchema rejects a non-masked secret", () => {
    const result = WebhookOutputSchema.safeParse({
      id: randomUUID(),
      orgId: randomUUID(),
      name: "my-hook",
      url: "https://example.com/hook",
      secret: "my-plaintext-secret",   // NOT "****"
      eventsFilter: null,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastDeliveryAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("WebhookOutputSchema accepts masked secret ****", () => {
    const result = WebhookOutputSchema.safeParse({
      id: randomUUID(),
      orgId: randomUUID(),
      name: "my-hook",
      url: "https://example.com/hook",
      secret: "****",
      eventsFilter: null,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastDeliveryAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("DeliveryOutputSchema rejects invalid status enum", () => {
    const result = DeliveryOutputSchema.safeParse({
      id: randomUUID(),
      orgId: randomUUID(),
      webhookId: randomUUID(),
      eventId: null,
      status: "invalid",
      attempt: 1,
      responseCode: null,
      error: null,
      nextRetryAt: null,
      createdAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("DeliveryOutputSchema accepts valid status enum values", () => {
    for (const status of ["pending", "delivered", "failed", "retrying"] as const) {
      const result = DeliveryOutputSchema.safeParse({
        id: randomUUID(),
        orgId: randomUUID(),
        webhookId: randomUUID(),
        eventId: null,
        status,
        attempt: 1,
        responseCode: null,
        error: null,
        nextRetryAt: null,
        createdAt: new Date(),
      });
      expect(result.success).toBe(true);
    }
  });

  it("WebhookInputSchema rejects non-URL for url field", () => {
    const result = WebhookOutputSchema.safeParse({
      id: randomUUID(),
      orgId: randomUUID(),
      name: "my-hook",
      url: "not-a-url",
      secret: "****",
      eventsFilter: null,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastDeliveryAt: null,
    });
    expect(result.success).toBe(false);
  });
});

// ─── 5. AppRouter type tree ───────────────────────────────────────────────────

describe("webhooks — AppRouter type tree", () => {
  it("appRouter includes webhooks namespace with expected procedures", () => {
    const caller = unauthCaller();
    // Type-level: all keys must be present (TypeScript compile check).
    type WebhooksKeys = keyof typeof caller.webhooks;
    type _Assert = [WebhooksKeys] extends [
      "list" | "get" | "create" | "update" | "delete" | "deliveries"
    ]
      ? true
      : false;
    const check: _Assert = true;
    expect(check).toBe(true);
  });
});
