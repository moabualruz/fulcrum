import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";
import { NotFoundException } from "@nestjs/common";
import { validateSync } from "class-validator";

import {
  RepositoryIdParamsDto,
  RepositoryListQueryDto,
  RepositoryPublicApiController,
  RepositoryPublicApiService,
} from "@integration-hub/interface/http/repository-public-api.controller.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const REPO_ID = "44444444-4444-4444-8444-444444444444";

function createController(caller: {
  list: (input: unknown) => Promise<unknown>;
  syncRepo: (input: unknown) => Promise<unknown>;
  statusRepo: (input: unknown) => Promise<unknown>;
}) {
  return new RepositoryPublicApiController(
    new RepositoryPublicApiService({
      featuresEnv: "public-api",
      orgId: ORG_ID,
      application: caller,
    }),
  );
}

describe("repo public API controller contract", () => {
  test("list returns rows from the repository facade instead of an in-memory stub", async () => {
    const list = mock(async () => [
      {
        id: REPO_ID,
        orgId: ORG_ID,
        name: "runtime-repo",
        slug: "runtime-repo",
        kind: "local",
        localPath: "/workspace/runtime-repo",
        remoteUrl: null,
        defaultBranch: "main",
        currentBranch: "main",
        lastSyncAt: null,
        syncStatus: "idle",
        lastTouchedAt: new Date("2026-05-05T12:00:00.000Z"),
        archived: false,
      },
    ]);
    const controller = createController({
      list,
      syncRepo: async () => {
        throw new Error("sync should not be called");
      },
      statusRepo: async () => {
        throw new Error("status should not be called");
      },
    });

    const body = await controller.listRepositories({ orgId: ORG_ID });

    expect(list).toHaveBeenCalledWith({ orgId: ORG_ID, includeArchived: false });
    expect(body).toEqual([
      expect.objectContaining({
        id: REPO_ID,
        orgId: ORG_ID,
        name: "runtime-repo",
        syncStatus: "idle",
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain("https://github.com/example/fulcrum");
  });

  test("sync enqueues sync payload and returns queued status", async () => {
    const syncRepo = mock(async () => ({
      repoId: REPO_ID,
      status: "queued",
      taskName: "repo.sync.local",
      jobKey: `repo.sync.local:${REPO_ID}`,
    }));
    const controller = createController({
      list: async () => [],
      syncRepo,
      statusRepo: async () => {
        throw new Error("status should not be called");
      },
    });

    const body = await controller.syncRepository({ id: REPO_ID }, { orgId: ORG_ID });

    expect(syncRepo).toHaveBeenCalledWith({ orgId: ORG_ID, repoId: REPO_ID });
    expect(body).toEqual({
      repoId: REPO_ID,
      status: "queued",
      taskName: "repo.sync.local",
      jobKey: `repo.sync.local:${REPO_ID}`,
    });
  });

  test("status returns 404 when repo belongs to another org", async () => {
    const controller = createController({
      list: async () => [],
      syncRepo: async () => {
        throw new Error("sync should not be called");
      },
      statusRepo: async (input) => {
        expect(input).toEqual({ orgId: ORG_ID, repoId: REPO_ID });
        return {
          repoId: REPO_ID,
          orgId: OTHER_ORG_ID,
          status: "synced",
          syncStatus: "idle",
          lastSyncAt: null,
          lastTouchedAt: null,
        };
      },
    });

    await expect(controller.getRepositoryStatus({ id: REPO_ID }, { orgId: ORG_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("repo API contract exposes DTO validation for list and sync inputs", () => {
    const query = Object.assign(new RepositoryListQueryDto(), { orgId: ORG_ID, includeArchived: true });
    const params = Object.assign(new RepositoryIdParamsDto(), { id: REPO_ID });
    const invalidParams = Object.assign(new RepositoryIdParamsDto(), { id: "not-a-uuid" });

    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
  });
});
