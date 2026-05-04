/**
 * tRPC core router tests — RED → GREEN.
 *
 * Acceptance criteria (from issue #06):
 *   1. Calling a protected procedure without a valid session returns UNAUTHORIZED.
 *   2. Calling a protected procedure with a session succeeds (returns data).
 *   3. ctx.orgId + ctx.userId populated on every authenticated call.
 *   4. publicProcedure (health.ping) accessible without session.
 *
 * Per C6: NO raw SQL strings outside src/db/migrations/.
 * Per C8: needle-di Container pattern; ctx.container set in context.
 */

import { afterEach, describe, it, expect } from "bun:test";
import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";
import { z } from "zod";

import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";
import { FlagRegistry } from "../../src/flags/registry.ts";
import { CasbinRuleRepository } from "../../src/db/repositories/flags/CasbinRuleRepository.ts";
import { protectedProcedure } from "../../src/trpc/middleware.ts";
import {
  DOC_TEMPLATE_SERVICE_TOKEN,
  type DocTemplateService,
} from "../../src/docs/doc-template-service.ts";

const createCaller = t.createCallerFactory(appRouter);
const LOCAL_ORG_ID = "00000000-0000-0000-0000-000000000001";
const LOCAL_BYPASS_FLAG = "trpc-permission-local-dev-bypass";
const previousFeatures = process.env["FULCRUM_FEATURES"];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a mock session object that satisfies the TRPCContext shape
// ─────────────────────────────────────────────────────────────────────────────
function mockSession(overrides?: Partial<{ id: string; userId: string; orgId: string }>) {
  return {
    id: overrides?.id ?? "sess-test-001",
    userId: overrides?.userId ?? "user-test-001",
    orgId: overrides?.orgId ?? LOCAL_ORG_ID,
    activeOrganizationId: overrides?.orgId ?? LOCAL_ORG_ID,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-test-001",
    ipAddress: null,
    userAgent: null,
  };
}

function unauthenticatedCaller() {
  return createCaller(
    createContext({
      session: null,
      orgId: null,
      userId: null,
      em: null,
      container: null,
    }),
  );
}

function authenticatedCaller(
  userId = "user-test-001",
  orgId = LOCAL_ORG_ID,
) {
  const session = mockSession({ userId, orgId });
  return createCaller(
    createContext({
      session: session as unknown as import("better-auth").Session,
      orgId,
      userId,
      em: null,
      container: null,
    }),
  );
}

function authenticatedCallerWithContainer(container: Container) {
  const userId = "user-test-001";
  const orgId = LOCAL_ORG_ID;
  const session = mockSession({ userId, orgId });
  return createCaller(
    createContext({
      session: session as unknown as import("better-auth").Session,
      orgId,
      userId,
      em: null,
      container,
    }),
  );
}

function casbinContainer(
  rows: Array<{ ptype: string; v0: string; v1: string; v2: string; v3?: string; v4?: string; v5?: string }>,
) {
  const container = new Container();
  container.bind({
    provide: FlagRegistry,
    useValue: { isEnabled: async () => true } as unknown as FlagRegistry,
  });
  container.bind({
    provide: CasbinRuleRepository,
    useValue: {
      findAll: async () => rows,
    } as unknown as CasbinRuleRepository,
  });
  return container;
}

function testCallerForRouter(
  router: ReturnType<typeof t.router>,
  container: Container,
): any {
  const factory = t.createCallerFactory(router);
  return factory(
    createContext({
      session: mockSession({ userId: "user-test-001" }) as unknown as import("better-auth").Session,
      orgId: LOCAL_ORG_ID,
      userId: "user-test-001",
      em: null,
      container,
    }),
  );
}

afterEach(() => {
  if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
  else process.env["FULCRUM_FEATURES"] = previousFeatures;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNAUTHORIZED — protected procedure without session
// ─────────────────────────────────────────────────────────────────────────────

describe("assertPermission middleware", () => {
  it("auth.whoami returns UNAUTHORIZED without session", async () => {
    const caller = unauthenticatedCaller();
    let error: TRPCError | null = null;
    try {
      await caller.auth.whoami();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });

  it("tasks.list returns UNAUTHORIZED without session", async () => {
    const caller = unauthenticatedCaller();
    let error: TRPCError | null = null;
    try {
      await caller.tasks.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });

  it("docs.list returns UNAUTHORIZED without session", async () => {
    const caller = unauthenticatedCaller();
    let error: TRPCError | null = null;
    try {
      await caller.docs.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("UNAUTHORIZED");
  });

  it("treats FlagRegistry lookup errors as casbin disabled", async () => {
    const container = new Container();
    container.bind({
      provide: FlagRegistry,
      useValue: {
        isEnabled: async () => {
          throw new Error("flag store unavailable");
        },
      } as unknown as FlagRegistry,
    });
    const caller = authenticatedCallerWithContainer(container);
    const result = await caller.auth.whoami();
    expect(result.userId).toBe("user-test-001");
    expect(result.orgId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("fails closed when casbin is enabled but enforcement wiring throws", async () => {
    const container = new Container();
    container.bind({
      provide: FlagRegistry,
      useValue: {
        isEnabled: async () => true,
      } as unknown as FlagRegistry,
    });
    container.bind({
      provide: CasbinRuleRepository,
      useFactory: () => {
        throw new Error("casbin repo unavailable");
      },
    });
    const caller = authenticatedCallerWithContainer(container);
    let error: TRPCError | null = null;
    try {
      await caller.tasks.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("treats containers without FlagRegistry as casbin disabled", async () => {
    const caller = authenticatedCallerWithContainer(new Container());
    const result = await caller.auth.whoami();
    expect(result.userId).toBe("user-test-001");
    expect(result.orgId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("derives casbin resource/action from procedure path when input omits them", async () => {
    const rows = [{ ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "secure", v3: "list" }];

    const container = casbinContainer(rows);

    const router = t.router({
      secure: t.router({
        list: protectedProcedure.query(() => "ok"),
      }),
    });
    const caller = testCallerForRouter(router, container);

    expect(await caller.secure.list()).toBe("ok");
  });

  it("ignores spoofed casbin resource/action input and enforces server route identity", async () => {
    const rows = [
      { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "public", v3: "update" },
      { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "secure", v3: "get" },
    ];
    const repo = {
      findAll: async () => rows,
    } as unknown as CasbinRuleRepository;

    const container = new Container();
    container.bind({
      provide: FlagRegistry,
      useValue: { isEnabled: async () => true } as unknown as FlagRegistry,
    });
    container.bind({ provide: CasbinRuleRepository, useValue: repo });

    const router = t.router({
      secure: t.router({
        update: protectedProcedure
          .input(z.object({ resource: z.string(), action: z.string() }))
          .mutation(() => "ok"),
      }),
    });
    const caller = testCallerForRouter(router, container);

    let error: TRPCError | null = null;
    try {
      await caller.secure.update({ resource: "public", action: "update" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("does not allow local-dev permission bypass unless env feature is enabled", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const router = t.router({
      secure: t.router({
        update: protectedProcedure.mutation(() => "ok"),
      }),
    });
    const caller = testCallerForRouter(router, casbinContainer([]));

    let error: TRPCError | null = null;
    try {
      await caller.secure.update();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("allows local-dev permission bypass only with env feature and logs the bypass", async () => {
    process.env["FULCRUM_FEATURES"] = [previousFeatures, LOCAL_BYPASS_FLAG]
      .filter(Boolean)
      .join(",");
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));

    try {
      const router = t.router({
        secure: t.router({
          update: protectedProcedure.mutation(() => "ok"),
        }),
      });
      const caller = testCallerForRouter(router, casbinContainer([]));

      expect(await caller.secure.update()).toBe("ok");
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings.some((line) => line.includes("permission bypass resource=secure action=update"))).toBe(true);
  });

  it("derives casbin resource from nested parent path and action from list leaf", async () => {
    const router = t.router({
      notify: t.router({
        rules: t.router({
          list: protectedProcedure.query(() => "ok"),
        }),
      }),
    });
    const caller = testCallerForRouter(
      router,
      casbinContainer([
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "notify.rules", v3: "list" },
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "notify", v3: "update" },
      ]),
    );

    expect(await caller.notify.rules.list()).toBe("ok");
  });

  it("derives casbin action from destructive unregister leaf", async () => {
    const router = t.router({
      repos: t.router({
        unregister: protectedProcedure
          .input(z.object({ id: z.string() }))
          .mutation(() => "ok"),
      }),
    });
    const caller = testCallerForRouter(
      router,
      casbinContainer([
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "repos", v3: "unregister" },
      ]),
    );

    expect(await caller.repos.unregister({ id: "repo-1" })).toBe("ok");
  });

  it("maps orchestration procedure leaves for casbin-enabled callers", async () => {
    const router = t.router({
      orchestration: t.router({
        fetchCandidateIssues: protectedProcedure.query(() => "fetchCandidateIssues-ok"),
        getRun: protectedProcedure.query(() => "getRun-ok"),
        fetchIssuesByStates: protectedProcedure.query(() => "fetchIssuesByStates-ok"),
        fetchIssueStatesByIds: protectedProcedure.query(() => "fetchIssueStatesByIds-ok"),
        getWorkspacePath: protectedProcedure.query(() => "getWorkspacePath-ok"),
        renderPromptPreview: protectedProcedure.query(() => "renderPromptPreview-ok"),
        claimRun: protectedProcedure.mutation(() => "claimRun-ok"),
      }),
    });
    const caller = testCallerForRouter(
      router,
      casbinContainer([
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "orchestration", v3: "fetchCandidateIssues" },
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "orchestration", v3: "getRun" },
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "orchestration", v3: "fetchIssuesByStates" },
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "orchestration", v3: "fetchIssueStatesByIds" },
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "orchestration", v3: "getWorkspacePath" },
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "orchestration", v3: "renderPromptPreview" },
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "orchestration", v3: "claimRun" },
      ]),
    );

    expect(await caller.orchestration.fetchCandidateIssues()).toBe("fetchCandidateIssues-ok");
    expect(await caller.orchestration.getRun()).toBe("getRun-ok");
    expect(await caller.orchestration.fetchIssuesByStates()).toBe("fetchIssuesByStates-ok");
    expect(await caller.orchestration.fetchIssueStatesByIds()).toBe("fetchIssueStatesByIds-ok");
    expect(await caller.orchestration.getWorkspacePath()).toBe("getWorkspacePath-ok");
    expect(await caller.orchestration.renderPromptPreview()).toBe("renderPromptPreview-ok");
    expect(await caller.orchestration.claimRun()).toBe("claimRun-ok");
  });

  it("maps docs.templates list and resolve leaves when casbin policies are enabled", async () => {
    const templateService: DocTemplateService = {
      list: async () => [
        {
          id: "tmpl-adr",
          orgId: LOCAL_ORG_ID,
          projectId: null,
          docType: "adr",
          name: "Default adr",
          frontmatterTemplate: {},
          bodyTemplate: "## Context",
          isDefault: true,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      resolve: async () => ({
        id: "tmpl-adr",
        orgId: LOCAL_ORG_ID,
        projectId: null,
        docType: "adr",
        name: "Default adr",
        frontmatterTemplate: {},
        bodyTemplate: "## Context",
        isDefault: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
    };
    const container = casbinContainer([
      { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "docs.templates", v3: "list" },
      { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "docs.templates", v3: "resolve" },
    ]);
    container.bind({
      provide: DOC_TEMPLATE_SERVICE_TOKEN,
      useValue: templateService,
    });
    const caller = authenticatedCallerWithContainer(container);

    await expect(caller.docs.templates.list({})).resolves.toHaveLength(1);
    await expect(caller.docs.templates.resolve({ docType: "adr", projectId: null }))
      .resolves.toMatchObject({ id: "tmpl-adr" });
  });

  it("fails closed when casbin is enabled for unmapped protected procedure leaf", async () => {
    const router = t.router({
      secure: t.router({
        publish: protectedProcedure.mutation(() => "ok"),
      }),
    });
    const caller = testCallerForRouter(
      router,
      casbinContainer([
        { ptype: "p", v0: LOCAL_ORG_ID, v1: "user-test-001", v2: "secure", v3: "write" },
      ]),
    );

    let error: TRPCError | null = null;
    try {
      await caller.secure.publish();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SUCCESS — protected procedure with session
// ─────────────────────────────────────────────────────────────────────────────

describe("authenticated calls", () => {
  it("auth.whoami returns userId + orgId for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.auth.whoami();
    expect(result.userId).toBe("user-test-001");
    expect(result.orgId).toBe("00000000-0000-0000-0000-000000000001");
    expect(typeof result.sessionId).toBe("string");
  });

  it("tasks.list returns empty array for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.tasks.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("docs.list returns empty array for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.docs.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("memory.list returns empty array for authenticated caller", async () => {
    const caller = authenticatedCaller();
    const result = await caller.memories.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Public procedures — accessible without session
// ─────────────────────────────────────────────────────────────────────────────

describe("public procedures", () => {
  it("health.ping succeeds without session", async () => {
    const caller = unauthenticatedCaller();
    const result = await caller.health.ping();
    expect(result.ok).toBe(true);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("db.ping succeeds without session", async () => {
    const caller = unauthenticatedCaller();
    const result = await caller.db.ping();
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Context population check
// ─────────────────────────────────────────────────────────────────────────────

describe("context population", () => {
  it("ctx.orgId is the well-known local org UUID for admin@local session", async () => {
    const LOCAL_ORG_UUID = "00000000-0000-0000-0000-000000000001";
    const caller = authenticatedCaller("admin-local-user", LOCAL_ORG_UUID);
    const result = await caller.auth.whoami();
    expect(result.orgId).toBe(LOCAL_ORG_UUID);
  });

  it("ctx.userId reflects the userId passed in context", async () => {
    const caller = authenticatedCaller("my-user-uuid");
    const result = await caller.auth.whoami();
    expect(result.userId).toBe("my-user-uuid");
  });
});
