import { afterEach, describe, expect, it } from "bun:test";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Session } from "better-auth";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";

const LOCAL_ORG_ID = "00000000-0000-0000-0000-000000000001";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REQUIRED_ROUTERS = [
  "auth",
  "orgs",
  "flags",
  "projects",
  "tasks",
  "sprints",
  "custom_fields",
  "saved_views",
  "docs",
  "doc_versions",
  "doc_comments",
  "doc_links",
  "memories",
  "context",
  "agent_runs",
  "artifacts",
  "repos",
  "repo_branches",
  "repo_commits",
  "search",
  "notify",
  "audit",
  "routing",
  "fulcrum_skills",
  "orchestration",
  "inference",
  "webhooks",
  "connectors",
  "doctor",
  "invitations",
] as const;

const REQUIRED_PROCEDURES = [
  "auth.whoami",
  "auth.invite",
  "auth.acceptInvite",
  "orgs.get",
  "orgs.update",
  "orgs.members.list",
  "flags.list",
  "flags.set",
  "projects.list",
  "projects.get",
  "projects.create",
  "projects.update",
  "projects.delete",
  "tasks.list",
  "tasks.get",
  "tasks.create",
  "tasks.update",
  "tasks.delete",
  "sprints.list",
  "sprints.get",
  "sprints.create",
  "sprints.update",
  "sprints.delete",
  "custom_fields.list",
  "custom_fields.create",
  "custom_fields.update",
  "custom_fields.delete",
  "saved_views.list",
  "saved_views.get",
  "saved_views.create",
  "saved_views.update",
  "saved_views.delete",
  "docs.list",
  "docs.get",
  "docs.create",
  "docs.update",
  "docs.delete",
  "doc_versions.list",
  "doc_versions.get",
  "doc_versions.restore",
  "doc_comments.list",
  "doc_comments.create",
  "doc_comments.update",
  "doc_comments.delete",
  "doc_links.list",
  "doc_links.create",
  "doc_links.delete",
  "memories.list",
  "memories.get",
  "memories.create",
  "memories.update",
  "memories.delete",
  "context.assemble",
  "context.preview",
  "agent_runs.list",
  "agent_runs.get",
  "agent_runs.create",
  "agent_runs.cancel",
  "agent_runs.retry",
  "artifacts.list",
  "artifacts.get",
  "artifacts.download",
  "artifacts.delete",
  "repos.list",
  "repos.get",
  "repos.register",
  "repos.sync",
  "repos.unregister",
  "repo_branches.list",
  "repo_branches.get",
  "repo_commits.list",
  "repo_commits.get",
  "search.query",
  "search.suggest",
  "search.savedList",
  "search.savedCreate",
  "search.savedDelete",
  "notify.list",
  "notify.unreadCount",
  "notify.markRead",
  "notify.mute",
  "notify.unmute",
  "audit.query",
  "audit.export",
  "routing.list",
  "routing.get",
  "routing.create",
  "routing.update",
  "routing.delete",
  "routing.test",
  "routing.dryRun",
  "fulcrum_skills.list",
  "fulcrum_skills.install",
  "fulcrum_skills.upgrade",
  "fulcrum_skills.uninstall",
  "fulcrum_skills.sync",
  "fulcrum_skills.resolveConflict",
  "orchestration.list",
  "inference.health",
  "webhooks.list",
  "webhooks.get",
  "webhooks.create",
  "webhooks.update",
  "webhooks.delete",
  "connectors.list",
  "connectors.get",
  "connectors.enable",
  "connectors.disable",
  "connectors.sync",
  "doctor.run",
  "doctor.subsystems",
  "invitations.list",
  "invitations.get",
  "invitations.create",
  "invitations.revoke",
] as const;

const PUBLIC_MUTATION_ALLOWLIST = new Set([
  "src/server/trpc/routers/auth.ts:acceptInvite",
]);

type RouterIntrospection = {
  _def: {
    record: Record<string, unknown>;
    procedures: Record<string, { _def?: { type?: string } }>;
  };
};

function mockSession(): Session {
  return {
    id: "session_p13_01",
    userId: "user_p13_01",
    token: "token_p13_01",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
  } as Session;
}

function authenticatedContext(responseHeaders?: Headers) {
  return createContext({
    session: mockSession(),
    orgId: LOCAL_ORG_ID,
    userId: "user_p13_01",
    em: null,
    container: null,
    responseHeaders,
  } as Parameters<typeof createContext>[0] & { responseHeaders?: Headers });
}

function unauthenticatedContext(responseHeaders?: Headers) {
  return createContext({
    session: null,
    orgId: null,
    userId: null,
    em: null,
    container: null,
    responseHeaders,
  } as Parameters<typeof createContext>[0] & { responseHeaders?: Headers });
}

function procedureNames() {
  return Object.keys((appRouter as unknown as RouterIntrospection)._def.procedures);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    if (!path.endsWith(".ts") || path.endsWith(".test.ts")) return [];
    return [path];
  });
}

function findMutationPermissionViolations(): string[] {
  const root = new URL("../..", import.meta.url).pathname;
  const files = [
    join(root, "src/trpc/router.ts"),
    ...sourceFiles(join(root, "src/trpc/routers")),
    ...sourceFiles(join(root, "src/server/trpc/routers")),
  ];

  const violations: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const rel = relative(root, file);
    const matches = source.matchAll(/\.mutation\s*\(/g);

    for (const match of matches) {
      const index = match.index ?? 0;
      const windowStart = Math.max(0, index - 700);
      const window = source.slice(windowStart, index);
      const procedureStarts = [...window.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(publicProcedure|protectedProcedure)/g)];
      const start = procedureStarts.at(-1);
      const name = start?.[1] ?? "<unknown>";
      const builder = start?.[2] ?? "<unknown>";
      const allowKey = `${rel}:${name}`;
      const protectedHelperChain = /\breturn\s+protectedProcedure\b/.test(window);

      if (
        builder !== "protectedProcedure" &&
        !protectedHelperChain &&
        !PUBLIC_MUTATION_ALLOWLIST.has(allowKey)
      ) {
        violations.push(allowKey);
      }
    }
  }

  return violations;
}

afterEach(async () => {
  const otel = await import("../../src/server/trpc/middleware/otel.ts").catch(() => null);
  otel?.setTRPCSpanRecorderForTests(null);
});

describe("P13.01 appRouter scaffold", () => {
  it("exports every enumerated Pillar 13 router namespace", () => {
    const routers = Object.keys((appRouter as unknown as RouterIntrospection)._def.record).sort();
    const missing = REQUIRED_ROUTERS.filter((name) => !routers.includes(name));

    expect(missing).toEqual([]);
  });

  it("exposes the additive scaffold procedures required for CLI and TUI codegen", () => {
    const procedures = procedureNames();
    const missing = REQUIRED_PROCEDURES.filter((name) => !procedures.includes(name));

    expect(missing).toEqual([]);
  });

  it("keeps mutation procedures behind assertPermission except explicit public auth flows", () => {
    expect(findMutationPermissionViolations()).toEqual([]);
  });

  it("keeps tRPC public schemas free of z.any()", () => {
    const root = new URL("../..", import.meta.url).pathname;
    const files = [
      join(root, "src/trpc/router.ts"),
      ...sourceFiles(join(root, "src/trpc/routers")),
      ...sourceFiles(join(root, "src/trpc/schemas")),
      ...sourceFiles(join(root, "src/server/trpc/routers")),
    ];
    const offenders = files
      .filter((file) => readFileSync(file, "utf8").includes("z.any("))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });
});

describe("P13.01 cross-cutting tRPC middleware", () => {
  it("injects a request id into caller context and fetch responses", async () => {
    const caller = t.createCallerFactory(appRouter)(authenticatedContext());
    const result = await caller.doctor.run();

    expect(result.requestId).toMatch(UUID_RE);

    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: new Request("http://localhost/api/trpc/doctor.run"),
      router: appRouter,
      createContext: ({ resHeaders }) => authenticatedContext(resHeaders),
    });

    expect(response.headers.get("x-fulcrum-request-id")).toMatch(UUID_RE);
  });

  it("adds the same request id to tRPC error payloads", async () => {
    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: new Request("http://localhost/api/trpc/doctor.run"),
      router: appRouter,
      createContext: ({ resHeaders }) => unauthenticatedContext(resHeaders),
    });
    const body = await response.json();
    const requestId = response.headers.get("x-fulcrum-request-id");

    expect(requestId).toMatch(UUID_RE);
    if (requestId === null) throw new Error("missing request id header");
    expect(JSON.stringify(body)).toContain(requestId);
  });

  it("records an OTel span per tRPC call with org, user, request, and procedure attributes", async () => {
    const otel = await import("../../src/server/trpc/middleware/otel.ts");
    const spans: Array<{ name: string; attributes: Record<string, string> }> = [];
    otel.setTRPCSpanRecorderForTests((span) => spans.push(span));

    const caller = t.createCallerFactory(appRouter)(authenticatedContext());
    await caller.doctor.run();

    expect(spans.at(-1)).toMatchObject({
      name: "fulcrum.trpc.doctor.run",
      attributes: {
        "org.id": LOCAL_ORG_ID,
        "user.id": "user_p13_01",
        "trpc.procedure": "doctor.run",
        "trpc.type": "query",
      },
    });
    expect(spans.at(-1)?.attributes["request.id"]).toMatch(UUID_RE);
  });
});
