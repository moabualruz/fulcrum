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

const NEST_PUBLIC_API_DOMAINS = [
  "tasks",
  "search",
  "runs",
  "artifacts",
  "notifications",
  "sprints",
  "docs",
  "memory",
  "repos",
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
});
