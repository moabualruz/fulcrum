import { access, readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const LEGACY_TRPC_PLANNING_BOILERPLATE_PATH = "apps/server/src/runtime/trpc/routers/planning.ts";

const PLANNING_BOILERPLATE_TARGET_FILES = [
  "services/planning-review/src/application/technical-planning-cycle.ts",
  "apps/web/src/routes/planning/+page.svelte",
  "apps/tui/src/index.ts",
] as const;

const APPLICATION_TRANSPORT_LEAK_FILES = [
  "services/identity-access/src/application/admin/queries.ts",
  "services/identity-access/src/application/permissions/enforcer.ts",
  "services/knowledge-workspace/src/application/document-service.ts",
  "services/knowledge-workspace/src/application/search/saved-searches.ts",
  "services/knowledge-workspace/src/application/docs/queries.ts",
  "services/knowledge-workspace/src/application/docs/version-reconstructor.ts",
  "services/knowledge-workspace/src/application/memory/hooks/after-run-hook.ts",
  "services/integration-hub/src/application/repos/repository-operations.ts",
  "services/platform-core/src/application/error-mapping.ts",
  "services/work-management/src/application/work-item-field-dependencies.ts",
  "services/work-management/src/application/work-item-recurrence.ts",
  "services/work-management/src/application/work-item-relationships.ts",
  "services/work-management/src/application/work-item-service.ts",
  "services/work-management/src/application/work-item-templates.ts",
  "services/work-management/src/application/templates/queries.ts",
  "services/work-management/src/application/work-cycle-service.ts",
  "services/work-management/src/application/work-item-comments.ts",
  "services/work-management/src/application/workflow-rules-service.ts",
] as const;

const PUBLIC_API_CONTROLLER_FILES = [
  "services/execution-orchestration/src/interface/http/agent-run-public-api.controller.ts",
  "services/identity-access/src/interface/http/auth-public-api.controller.ts",
  "services/identity-access/src/interface/http/invitation-public-api.controller.ts",
  "services/integration-hub/src/interface/http/connector-public-api.controller.ts",
  "services/integration-hub/src/interface/http/data-portability-public-api.controller.ts",
  "services/integration-hub/src/interface/http/repository-public-api.controller.ts",
  "services/integration-hub/src/interface/http/webhook-public-api.controller.ts",
  "services/knowledge-workspace/src/interface/http/document-public-api.controller.ts",
  "services/knowledge-workspace/src/interface/http/memory-public-api.controller.ts",
  "services/knowledge-workspace/src/interface/http/search-public-api.controller.ts",
  "services/notification-center/src/interface/http/notification-public-api.controller.ts",
  "services/platform-core/src/interface/http/error-log-public-api.controller.ts",
  "services/platform-core/src/interface/http/feature-experiment-public-api.controller.ts",
  "services/platform-core/src/interface/http/inference-public-api.controller.ts",
  "services/platform-core/src/interface/http/skill-supply-public-api.controller.ts",
  "services/platform-core/src/interface/http/subscription-event-stream.controller.ts",
  "services/platform-core/src/interface/http/telemetry-public-api.controller.ts",
  "services/work-management/src/interface/http/report-public-api.controller.ts",
  "services/work-management/src/interface/http/saved-view-public-api.controller.ts",
  "services/work-management/src/interface/http/sprint-public-api.controller.ts",
  "services/work-management/src/interface/http/task-public-api.controller.ts",
  "services/work-management/src/interface/http/task-recurrence-public-api.controller.ts",
  "services/workflow-coordination/src/interface/http/artifact-public-api.controller.ts",
  "services/workflow-coordination/src/interface/http/audit-public-api.controller.ts",
] as const;

describe("server stack convergence", () => {
  test("Hono compatibility shell files and dependencies are removed", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(await fileExists("apps/server/src/api/hono.ts")).toBe(false);
    expect(await fileExists("apps/server/src/api/auth.ts")).toBe(false);
    expect(await fileExists("apps/server/src/api/rate-limit.ts")).toBe(false);
    expect(dependencies).not.toHaveProperty("hono");
    expect(dependencies).not.toHaveProperty("@hono/zod-openapi");
  });

  test("legacy tRPC REST shims do not keep Hono route factories alive", async () => {
    const legacyShimPath = "apps/server/src/trpc/rest-api.ts";

    expect(await fileExists(legacyShimPath)).toBe(false);
  });

  test("unused tRPC compatibility re-export files are removed", async () => {
    expect(await fileExists("apps/server/src/runtime/trpc/router.ts")).toBe(false);
    expect(await fileExists("apps/server/src/runtime/trpc/routers/artifacts.ts")).toBe(false);
  });

  test("unused direct CLI tRPC HTTP client is removed", async () => {
    expect(await fileExists("apps/cli/src/trpc-client.ts")).toBe(false);
  });

  test("planning boilerplate defaults do not point at tRPC runtime routers", async () => {
    const offenders: string[] = [];
    for (const file of PLANNING_BOILERPLATE_TARGET_FILES) {
      const source = await readFile(file, "utf8");
      if (source.includes(LEGACY_TRPC_PLANNING_BOILERPLATE_PATH)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("application services do not throw transport-specific tRPC errors", async () => {
    const offenders: string[] = [];
    for (const file of APPLICATION_TRANSPORT_LEAK_FILES) {
      const source = await readFile(file, "utf8");
      if (source.includes("@trpc/server") || source.includes("TRPCError")) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("server tRPC adapters are not stored in platform application modules", async () => {
    expect(await fileExists("services/platform-core/src/application/secrets/credentials-router.ts")).toBe(false);
    expect(await fileExists("services/platform-core/src/application/subscriptions/procedures.ts")).toBe(false);
    expect(await fileExists("services/platform-core/src/application/cli-tui/caller-context.ts")).toBe(false);
    expect(await fileExists("services/integration-hub/src/application/repos/trpc-adapter.ts")).toBe(false);
  });

  test("public API controllers delegate persistence to stores instead of repositories", async () => {
    const offenders: string[] = [];
    for (const file of PUBLIC_API_CONTROLLER_FILES) {
      const source = await readFile(file, "utf8");
      if (source.includes(".getRepository(") || source.includes("FindOptionsWhere")) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("the public agent-run API is implemented as a Nest controller", async () => {
    const legacyHonoPath = "apps/server/src/api/routes/runs.ts";
    const source = await readFile(
      "services/execution-orchestration/src/interface/http/agent-run-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyHonoPath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain("from \"hono\"");
  });

  test("invitation public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/identity-access/src/interface/http/invitation-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("auth public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/identity-access/src/interface/http/auth-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("product search public API is implemented as a Nest controller", async () => {
    const legacyHonoPath = "services/platform-core/src/infrastructure/product-store/api/search-api.ts";
    const legacyServerRoutePath = "apps/server/src/api/routes/search.ts";
    const source = await readFile(
      "services/knowledge-workspace/src/interface/http/search-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyHonoPath)).toBe(false);
    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("artifact public API is implemented as a Nest controller", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/artifacts.ts";
    const source = await readFile(
      "services/workflow-coordination/src/interface/http/artifact-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("notification public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-notifications.ts";
    const legacyMetadataRoutePath = "apps/server/src/api/routes/notifications.ts";
    const source = await readFile(
      "services/notification-center/src/interface/http/notification-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(await fileExists(legacyMetadataRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Patch(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("audit public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-audit.ts";
    const legacyMetadataRoutePath = "apps/server/src/api/routes/audit.ts";
    const source = await readFile(
      "services/workflow-coordination/src/interface/http/audit-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(await fileExists(legacyMetadataRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("sprint public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-sprints.ts";
    const legacyMetadataRoutePath = "apps/server/src/api/routes/sprints.ts";
    const source = await readFile(
      "services/work-management/src/interface/http/sprint-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(await fileExists(legacyMetadataRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("report public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-reports.ts";
    const source = await readFile(
      "services/work-management/src/interface/http/report-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("document public API is implemented as a Nest controller", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/docs.ts";
    const source = await readFile(
      "services/knowledge-workspace/src/interface/http/document-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("memory public API is implemented as Nest controllers", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/memory.ts";
    const source = await readFile(
      "services/knowledge-workspace/src/interface/http/memory-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("saved-view public API is implemented as a Nest controller", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/saved-views.ts";
    const source = await readFile(
      "services/work-management/src/interface/http/saved-view-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("repository public API is implemented as a Nest controller", async () => {
    const legacyServerRoutePath = "apps/server/src/api/routes/repos.ts";
    const source = await readFile(
      "services/integration-hub/src/interface/http/repository-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyServerRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("connector public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/integration-hub/src/interface/http/connector-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("webhook public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/integration-hub/src/interface/http/webhook-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("data portability public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/integration-hub/src/interface/http/data-portability-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("task public API is implemented as a Nest controller", async () => {
    const legacyKernelRoutePath = "apps/server/src/api/routes/kernel-tasks.ts";
    const legacyMetadataRoutePath = "apps/server/src/api/routes/tasks.ts";
    const source = await readFile(
      "services/work-management/src/interface/http/task-public-api.controller.ts",
      "utf8",
    );

    expect(await fileExists(legacyKernelRoutePath)).toBe(false);
    expect(await fileExists(legacyMetadataRoutePath)).toBe(false);
    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("task recurrence public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/work-management/src/interface/http/task-recurrence-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("inference public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/inference-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("error log public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/error-log-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("feature experiment public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/feature-experiment-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("telemetry public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/telemetry-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("subscription event stream public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/subscription-event-stream.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });

  test("skill supply public API is implemented as a Nest controller", async () => {
    const source = await readFile(
      "services/platform-core/src/interface/http/skill-supply-public-api.controller.ts",
      "utf8",
    );

    expect(source).toContain("Controller(");
    expect(source).toContain("Get(");
    expect(source).toContain("Post(");
    expect(source).toContain("Patch(");
    expect(source).toContain("Delete(");
    expect(source).not.toContain("@hono/zod-openapi");
    expect(source).not.toContain("OpenAPIHono");
  });
});
