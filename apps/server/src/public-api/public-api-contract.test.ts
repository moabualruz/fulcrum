import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { MODULE_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import { AgentRunPublicApiModule } from "@execution-orchestration/interface/http/agent-run-public-api.controller.ts";
import { RepositoryPublicApiModule } from "@integration-hub/interface/http/repository-public-api.controller.ts";
import { DocumentPublicApiModule } from "@knowledge-workspace/interface/http/document-public-api.controller.ts";
import { MemoryPublicApiModule } from "@knowledge-workspace/interface/http/memory-public-api.controller.ts";
import { SearchPublicApiModule } from "@knowledge-workspace/interface/http/search-public-api.controller.ts";
import { NotificationPublicApiModule } from "@notification-center/interface/http/notification-public-api.controller.ts";
import { listMissingApiDomains } from "@platform-core/application/interface-parity/surface-domain-matrix.ts";
import { DoctorPublicApiModule } from "@platform-core/interface/http/doctor-public-api.controller.ts";
import { AuditPublicApiModule } from "@workflow-coordination/interface/http/audit-public-api.controller.ts";
import { ArtifactPublicApiModule } from "@workflow-coordination/interface/http/artifact-public-api.controller.ts";
import { ReportPublicApiModule } from "@work-management/interface/http/report-public-api.controller.ts";
import { SavedViewPublicApiModule } from "@work-management/interface/http/saved-view-public-api.controller.ts";
import { SprintPublicApiModule } from "@work-management/interface/http/sprint-public-api.controller.ts";
import { TaskPublicApiModule } from "@work-management/interface/http/task-public-api.controller.ts";
import {
  assertStablePublicRouteIsVersioned,
  attachRouteTaxonomyMetadata,
  classifyRoutePath,
  createRouteTaxonomyMetadata,
  isStablePublicRoute,
  ROUTE_NAMESPACES,
  ROUTE_VERSIONING_POLICY,
} from "./route-taxonomy.ts";

const NEST_PUBLIC_API_DOMAINS = [
  "projects",
  "tasks",
  "search",
  "runs",
  "artifacts",
  "notifications",
  "sprints",
  "docs",
  "memory",
  "repos",
  "reports",
  "planning",
  "review",
  "settings",
] as const;

const REQUIRED_API_MODULES = [
  AgentRunPublicApiModule,
  DoctorPublicApiModule,
  RepositoryPublicApiModule,
  DocumentPublicApiModule,
  MemoryPublicApiModule,
  SearchPublicApiModule,
  NotificationPublicApiModule,
  AuditPublicApiModule,
  ArtifactPublicApiModule,
  ReportPublicApiModule,
  SavedViewPublicApiModule,
  SprintPublicApiModule,
  TaskPublicApiModule,
] as const;

describe("Nest public API contract", () => {
  test("AppModule composes public API modules for required surface domains", () => {
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    for (const apiModule of REQUIRED_API_MODULES) {
      expect(appImports).toContain(apiModule);
    }
    expect(listMissingApiDomains([...NEST_PUBLIC_API_DOMAINS])).toEqual([]);
  });

  test("classifies route namespaces by stability and lifecycle", () => {
    expect(classifyRoutePath("/api/v1/tasks").name).toBe("public-rest");
    expect(classifyRoutePath("/api/v1/events/runs").name).toBe("event-stream");
    expect(classifyRoutePath("/api/v1/webhooks/hook-1/test").name).toBe("webhook");
    expect(classifyRoutePath("/workflows/execution/preview").name).toBe("workflow-http");
    expect(classifyRoutePath("/api/trpc/tasks.list").name).toBe("web-trpc-bridge");
    expect(classifyRoutePath("/trpc/tasks.list").name).toBe("internal-trpc");
    expect(classifyRoutePath("/api/active-project").name).toBe("internal-web");
  });

  test("stable public routes use documented prefixes and keep tRPC/web internals non-public", () => {
    for (const path of ["/api/v1/tasks", "/api/v1/webhooks", "/api/v1/events/runs", "/workflows/execution"]) {
      expect(isStablePublicRoute(path)).toBe(true);
      expect(() => assertStablePublicRouteIsVersioned(path)).not.toThrow();
    }

    for (const path of ["/api/trpc/tasks.list", "/trpc/tasks.list", "/api/active-project"]) {
      expect(isStablePublicRoute(path)).toBe(false);
    }

    expect(() => assertStablePublicRouteIsVersioned("/public/tasks")).toThrow(
      "Stable public route must use a documented versioned prefix: /public/tasks",
    );
  });

  test("route taxonomy metadata documents deprecation policy for generated OpenAPI", () => {
    const metadata = createRouteTaxonomyMetadata();
    const document: Record<string, unknown> = {
      openapi: "3.1.0",
      info: { title: "Fulcrum API" },
    };

    attachRouteTaxonomyMetadata(document);

    expect(metadata).toEqual({
      versioning: ROUTE_VERSIONING_POLICY,
      namespaces: ROUTE_NAMESPACES,
    });
    expect(document["info"]).toMatchObject({
      "x-fulcrum-route-taxonomy": metadata,
      "x-fulcrum-deprecation-policy": ROUTE_VERSIONING_POLICY,
    });
  });
});
