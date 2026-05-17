import "reflect-metadata";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";

import { InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { isPublicApiEnabled } from "@fulcrum/server/api/feature-flags.ts";
import {
  AgentRunPublicApiController,
  AgentRunPublicApiModule,
  AgentRunPublicApiService,
  AgentRunPublicRunsController,
  AgentRunDispatchBodyDto,
  AgentRunIssueListQueryDto,
  AgentRunListQueryDto,
  AgentRunRouteParamsDto,
  AgentRunRefreshResponseDto,
} from "@execution-orchestration/interface/http/agent-run-public-api.controller.ts";
import {
  createLocalOrg,
  createRun,
  migrateIsolatedStore,
  openIsolatedStore,
} from "@test-support/product-workspace-fixtures.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-agent-run-public-api-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

describe("agent-run public API feature gate", () => {
  test("is disabled unless public-api is enabled", () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    expect(isPublicApiEnabled()).toBe(false);
    process.env.FULCRUM_FEATURES = "some-flag,public-api,other";
    expect(isPublicApiEnabled()).toBe(true);
    if (original === undefined) delete process.env.FULCRUM_FEATURES;
    else process.env.FULCRUM_FEATURES = original;
  });
});

describe("agent-run public Nest API", () => {
  test("is wired as a Nest controller without a legacy route factory", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AgentRunPublicApiModule) as unknown[];

    expect(controllers).toContain(AgentRunPublicApiController);
    expect(controllers).toContain(AgentRunPublicRunsController);
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicApiController)).toBe("api/v1/symphony");
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicApiController.prototype.loadStatus)).toBe("state");
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicApiController.prototype.loadStatus)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicApiController.prototype.loadRun)).toBe(
      ":identifier",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicApiController.prototype.loadRun)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicApiController.prototype.refreshRuns)).toBe(
      "refresh",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicApiController.prototype.refreshRuns)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicApiController.prototype.listCandidateIssues)).toBe(
      "candidates",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicApiController.prototype.listCandidateIssues)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicApiController.prototype.listRunIssuesByStates)).toBe(
      "issues",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicApiController.prototype.listRunIssuesByStates)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicRunsController)).toBe("api/v1/runs");
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicRunsController.prototype.listRuns)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicRunsController.prototype.listRuns)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicRunsController.prototype.loadRun)).toBe(
      ":identifier",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicRunsController.prototype.loadRun)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicRunsController.prototype.dispatchRun)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicRunsController.prototype.dispatchRun)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicRunsController.prototype.cancelRun)).toBe(
      ":identifier/cancel",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicRunsController.prototype.cancelRun)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AgentRunPublicRunsController.prototype.retryRun)).toBe(
      ":identifier/retry",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, AgentRunPublicRunsController.prototype.retryRun)).toBe(
      RequestMethod.POST,
    );
  });

  test("delegates state, run lookup, and refresh to the run service", async () => {
    const db = await freshDb("routes");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const run = await createRun(db, { orgId: org.id, identifier: "r1" }) as { id: string };
      const service = new AgentRunPublicApiService({
        store: db,
        orgId: org.id,
        featuresEnv: "public-api",
      });
      const controller = new AgentRunPublicApiController(service);

      await expect(controller.loadStatus()).resolves.toMatchObject({ pending: 1 });
      await expect(controller.loadRun({ identifier: run.id })).resolves.toMatchObject({ id: run.id });
      await expect(controller.refreshRuns()).resolves.toMatchObject({ count: 1 });
    } finally {
      await db.close();
    }
  });

  test("lists and loads agent runs through the Nest runs controller", async () => {
    const db = await freshDb("runs");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const run = await createRun(db, { orgId: org.id, identifier: "r1" }) as {
        id: string;
        symphony_state: string;
      };
      const service = new AgentRunPublicApiService({
        store: db,
        orgId: org.id,
        featuresEnv: "public-api",
      });
      const controller = new AgentRunPublicRunsController(service);

      await expect(controller.listRuns({})).resolves.toContainEqual(expect.objectContaining({ id: run.id }));
      await expect(controller.listRuns({ status: run.symphony_state })).resolves.toContainEqual(
        expect.objectContaining({ id: run.id }),
      );
      await expect(controller.loadRun({ identifier: run.id })).resolves.toMatchObject({ id: run.id });
    } finally {
      await db.close();
    }
  });

  test("throws a Nest 404 when an agent run is missing", async () => {
    const db = await freshDb("missing");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const service = new AgentRunPublicApiService({
        store: db,
        orgId: org.id,
        featuresEnv: "public-api",
      });
      const controller = new AgentRunPublicApiController(service);

      await expect(controller.loadRun({ identifier: "nonexistent" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    } finally {
      await db.close();
    }
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new AgentRunPublicApiController(new AgentRunPublicApiService());

      await expect(controller.loadStatus()).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the run store is not configured", async () => {
    const original = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "public-api";
    try {
      const controller = new AgentRunPublicApiController(new AgentRunPublicApiService());

      await expect(controller.loadStatus()).rejects.toBeInstanceOf(InternalServerErrorException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("keeps request and response validation at the Nest boundary", () => {
    const params = Object.assign(new AgentRunRouteParamsDto(), { identifier: "run_123" });
    const invalidParams = Object.assign(new AgentRunRouteParamsDto(), { identifier: "" });
    const query = Object.assign(new AgentRunListQueryDto(), {
      orgId: "org-1",
      status: "pending",
      limit: 25,
      offset: 0,
    });
    const invalidQuery = Object.assign(new AgentRunListQueryDto(), { orgId: "", limit: 25, offset: 0 });
    const issueQuery = Object.assign(new AgentRunIssueListQueryDto(), {
      orgId: "org-1",
      states: "running,retry_queued",
      limit: 25,
    });
    const invalidIssueQuery = Object.assign(new AgentRunIssueListQueryDto(), { states: "" });
    const dispatchBody = Object.assign(new AgentRunDispatchBodyDto(), {
      taskId: "task-1",
      agent: "codex",
      dependencyTree: ["task-0"],
    });
    const invalidDispatchBody = Object.assign(new AgentRunDispatchBodyDto(), { taskId: "" });
    const response = Object.assign(new AgentRunRefreshResponseDto(), { runs: [], count: 0 });

    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toContain("identifier");
    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(invalidQuery).map((error) => error.property)).toContain("orgId");
    expect(validateSync(issueQuery)).toHaveLength(0);
    expect(validateSync(invalidIssueQuery).map((error) => error.property)).toContain("states");
    expect(validateSync(dispatchBody)).toHaveLength(0);
    expect(validateSync(invalidDispatchBody).map((error) => error.property)).toContain("taskId");
    expect(validateSync(response)).toHaveLength(0);
  });
});
