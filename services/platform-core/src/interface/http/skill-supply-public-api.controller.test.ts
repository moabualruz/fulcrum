import "reflect-metadata";

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import { writeSkillsLockFile } from "@platform-core/application/skill-supply/lock.ts";
import { SkillLockStore } from "@platform-core/infrastructure/skill-supply/skill-lock-store.ts";
import {
  SkillSupplyInstallDto,
  SkillSupplyOverrideConflictDto,
  SkillSupplyOverrideLockDto,
  SkillSupplyPublicApiController,
  SkillSupplyPublicApiModule,
  SkillSupplyPublicApiService,
  SkillSupplyResolveConflictDto,
  SkillSupplySyncDto,
  SkillSupplyUpgradeDto,
} from "@platform-core/interface/http/skill-supply-public-api.controller.ts";

let scratch = "";

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-skill-supply-api-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("skill supply public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SkillSupplyPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(SkillSupplyPublicApiController);
    expect(appImports).toContain(SkillSupplyPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, SkillSupplyPublicApiController)).toBe("api/v1/skills");
    expect(Reflect.getMetadata(METHOD_METADATA, SkillSupplyPublicApiController.prototype.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, SkillSupplyPublicApiController.prototype.registryList)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, SkillSupplyPublicApiController.prototype.install)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, SkillSupplyPublicApiController.prototype.sync)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata("swagger/apiResponse", SkillSupplyPublicApiController.prototype.sync)).toMatchObject({
      "400": { description: "Invalid request - Check request schema" },
      "401": { description: "Unauthorized - Reauthenticate" },
      "403": { description: "Forbidden - Check permissions" },
      "404": { description: "Not found - Verify resource exists" },
    });
    expect(Reflect.getMetadata(METHOD_METADATA, SkillSupplyPublicApiController.prototype.uninstall)).toBe(RequestMethod.DELETE);
  });

  test("manages lock-backed skill rows without tRPC or ORM dependencies", async () => {
    const installedAt = "2026-05-14T00:00:00.000Z";
    await writeSkillsLockFile(
      {
        reviewer: {
          version: "1.0.0",
          hash: "local-hash",
          installedAt,
          upstream_conflict: "upstream-hash",
          enabled_agents: ["codex"],
        },
      },
      { fulcrumHome: scratch },
    );
    const controller = controllerForScratch();

    await expect(controller.list()).resolves.toEqual([
      {
        id: "reviewer",
        name: "reviewer",
        slug: "reviewer",
        source: "local",
        upstreamRepo: null,
        upstreamRef: null,
        version: "1.0.0",
        hash: "local-hash",
        installedAt,
        enabledAgents: ["codex"],
      },
    ]);
    await expect(controller.listConflicts()).resolves.toEqual([
      {
        id: "reviewer",
        slug: "reviewer",
        kind: "lock",
        status: "open",
        localHash: "local-hash",
        upstreamHash: "upstream-hash",
        createdAt: installedAt,
        updatedAt: installedAt,
      },
    ]);
    await expect(controller.resolveConflict({ slug: "reviewer", resolution: "upstream" })).resolves.toMatchObject({
      slug: "reviewer",
      hash: "upstream-hash",
    });
    await expect(controller.overrideLock({
      slug: "reviewer",
      expectedSha256: "upstream-hash",
      actualSha256: "manual-hash",
      auditNote: "approved",
    })).resolves.toEqual({ ok: true });
    const syncResult = await controller.sync({ fetchUpstream: true });
    expect(syncResult).toMatchObject({
      ok: true,
      merged: [],
      conflicts: [],
      errors: ["Upstream skill fetch is pending the TypeORM skill-supply service migration."],
    });
    expect(syncResult.trace_id).toStartWith("trace-skills-sync-");
    await expect(controller.sync()).resolves.toMatchObject({ ok: true, errors: [] });
    await expect(controller.uninstall("reviewer")).resolves.toEqual({ ok: true, slug: "reviewer" });
    await expect(controller.uninstall("reviewer")).rejects.toBeInstanceOf(NotFoundException);
  });

  test("installs a local skill descriptor into the lock-backed registry", async () => {
    const skillDir = join(scratch, "source-skill");
    await mkdir(skillDir);
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: Review Helper\nversion: 2.0.0\n---\n\n# Review Helper\n",
      "utf8",
    );
    const controller = controllerForScratch();

    const row = await controller.install({ path: skillDir });

    expect(row).toMatchObject({
      id: "review-helper",
      name: "review-helper",
      slug: "review-helper",
      version: "2.0.0",
      source: "local",
      enabledAgents: ["claude", "codex", "gemini", "opencode", "pi"],
    });
    await expect(controller.upgrade({ slug: "all" })).resolves.toHaveLength(1);
  });

  test("keeps request validation at the Nest boundary", () => {
    const install = Object.assign(new SkillSupplyInstallDto(), { path: "/tmp/skill" });
    const upgrade = Object.assign(new SkillSupplyUpgradeDto(), { slug: "reviewer" });
    const sync = Object.assign(new SkillSupplySyncDto(), { fetchUpstream: true });
    const resolve = Object.assign(new SkillSupplyResolveConflictDto(), { slug: "reviewer", resolution: "editor" });
    const conflict = Object.assign(new SkillSupplyOverrideConflictDto(), {
      conflictId: "reviewer",
      resolution: "local",
      auditNote: "manual",
    });
    const lock = Object.assign(new SkillSupplyOverrideLockDto(), {
      slug: "reviewer",
      expectedSha256: "expected",
      actualSha256: "actual",
      auditNote: "manual",
    });

    expect(validateSync(install)).toEqual([]);
    expect(validateSync(upgrade)).toEqual([]);
    expect(validateSync(sync)).toEqual([]);
    expect(validateSync(resolve)).toEqual([]);
    expect(validateSync(conflict)).toEqual([]);
    expect(validateSync(lock)).toEqual([]);
  });
});

function controllerForScratch(): SkillSupplyPublicApiController {
  return new SkillSupplyPublicApiController(
    new SkillSupplyPublicApiService(new SkillLockStore({ fulcrumHome: scratch })),
  );
}
