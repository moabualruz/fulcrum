import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { BadRequestException, InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  RepositoryBranchPublicApiController,
  RepositoryCommitPublicApiController,
  RepositoryCreateBodyDto,
  RepositoryIdParamsDto,
  RepositoryListQueryDto,
  RepositoryFileQueryDto,
  RepositoryPublicApiController,
  RepositoryPublicApiModule,
  RepositoryPublicApiService,
  RepositoryReadModelIdParamsDto,
  RepositoryReadModelListQueryDto,
  RepositoryRequestContextDto,
  RepositoryTreeQueryDto,
} from "@integration-hub/interface/http/repository-public-api.controller.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const REPO_ID = "44444444-4444-4444-8444-444444444444";

function repositoryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    lastTouchedAt: new Date("2026-05-14T00:00:00.000Z"),
    archived: false,
    ...overrides,
  };
}

describe("repository public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, RepositoryPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(RepositoryPublicApiController);
    expect(controllers).toContain(RepositoryBranchPublicApiController);
    expect(controllers).toContain(RepositoryCommitPublicApiController);
    expect(appImports).toContain(RepositoryPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController)).toBe("api/v1/repos");
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryBranchPublicApiController)).toBe("api/v1/repo-branches");
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryCommitPublicApiController)).toBe("api/v1/repo-commits");
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.listRepositories)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.listRepositories)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.registerRepository)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.syncRepositories)).toBe("sync");
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.syncRepositories)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.loadRepository)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.loadRepository)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.syncRepository)).toBe(":id/sync");
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.syncRepository)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.getRepositoryStatus)).toBe(
      ":id/status",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.getRepositoryStatus)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.getRepositoryTree)).toBe(
      ":id/tree",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.getRepositoryTree)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.getRepositoryFile)).toBe(
      ":id/file",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.getRepositoryFile)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.unregisterRepository)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryBranchPublicApiController.prototype.listBranches)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryBranchPublicApiController.prototype.listBranches)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryBranchPublicApiController.prototype.getBranch)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryBranchPublicApiController.prototype.getBranch)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryCommitPublicApiController.prototype.listCommits)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryCommitPublicApiController.prototype.listCommits)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryCommitPublicApiController.prototype.getCommit)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryCommitPublicApiController.prototype.getCommit)).toBe(
      RequestMethod.GET,
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new RepositoryPublicApiController(new RepositoryPublicApiService());

      await expect(controller.listRepositories({ orgId: ORG_ID })).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the application facade is not configured", async () => {
    const controller = new RepositoryPublicApiController(
      new RepositoryPublicApiService({ featuresEnv: "public-api", orgId: ORG_ID }),
    );

    await expect(controller.listRepositories({ orgId: ORG_ID })).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  test("delegates repository operations to the repository application facade", async () => {
    const list = mock(async () => [repositoryRow()]);
    const register = mock(async () => repositoryRow({ id: "repo-created", slug: "repo-created" }));
    const get = mock(async () => repositoryRow());
    const sync = mock(async () => [{ repoId: REPO_ID, status: "queued" }]);
    const syncRepo = mock(async () => ({
      repoId: REPO_ID,
      status: "queued",
      taskName: "repo.sync.local",
      jobKey: `repo.sync.local:${REPO_ID}`,
    }));
    const statusRepo = mock(async () => ({
      repoId: REPO_ID,
      orgId: ORG_ID,
      status: "synced",
      syncStatus: "idle",
      lastSyncAt: null,
      lastTouchedAt: null,
    }));
    const getFileTree = mock(async () => ({
      repoId: REPO_ID,
      branch: "main",
      dir: "docs",
      entries: [{ path: "docs/guide.txt", kind: "file", sizeBytes: 42 }],
    }));
    const getFileContent = mock(async () => ({
      repoId: REPO_ID,
      branch: "main",
      path: "docs/guide.txt",
      mimeType: "text/plain",
      encoding: "utf8",
      content: "guide\n",
    }));
    const unregister = mock(async () => undefined);
    const listBranches = mock(async () => [
      {
        id: "branch-1",
        orgId: ORG_ID,
        repoId: REPO_ID,
        name: "main",
        lastSeenAt: new Date("2026-05-14T00:00:00.000Z"),
      },
    ]);
    const getBranch = mock(async () => ({
      id: "branch-1",
      orgId: ORG_ID,
      repoId: REPO_ID,
      name: "main",
    }));
    const listCommits = mock(async () => [
      {
        id: "commit-1",
        orgId: ORG_ID,
        repoId: REPO_ID,
        sha: "a".repeat(40),
        committedAt: new Date("2026-05-14T00:00:00.000Z"),
      },
    ]);
    const getCommit = mock(async () => ({
      id: "commit-1",
      orgId: ORG_ID,
      repoId: REPO_ID,
      sha: "a".repeat(40),
    }));
    const controller = new RepositoryPublicApiController(
      new RepositoryPublicApiService({
        featuresEnv: "public-api",
        orgId: ORG_ID,
        application: {
          list,
          register,
          get,
          sync,
          syncRepo,
          statusRepo,
          getFileTree,
          getFileContent,
          unregister,
          listBranches,
          getBranch,
          listCommits,
          getCommit,
        },
      }),
    );
    const service = new RepositoryPublicApiService({
      featuresEnv: "public-api",
      orgId: ORG_ID,
      application: {
        list,
        register,
        get,
        sync,
        syncRepo,
        statusRepo,
        getFileTree,
        getFileContent,
        unregister,
        listBranches,
        getBranch,
        listCommits,
        getCommit,
      },
    });
    const branchController = new RepositoryBranchPublicApiController(service);
    const commitController = new RepositoryCommitPublicApiController(service);

    await expect(controller.listRepositories({ orgId: ORG_ID, includeArchived: "true" })).resolves.toEqual([
      expect.objectContaining({
        id: REPO_ID,
        lastTouchedAt: "2026-05-14T00:00:00.000Z",
      }),
    ]);
    await expect(controller.registerRepository({
      orgId: ORG_ID,
      name: "Repo created",
      slug: "repo-created",
      kind: "local",
      localPath: "/workspace/repo-created",
      projectId: "project-1",
      defaultBranch: "main",
    })).resolves.toEqual(expect.objectContaining({ id: "repo-created" }));
    await expect(controller.loadRepository({ id: REPO_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: REPO_ID }),
    );
    await expect(controller.syncRepositories({ orgId: ORG_ID })).resolves.toEqual({
      data: [expect.objectContaining({ repoId: REPO_ID, status: "queued" })],
    });
    await expect(controller.syncRepository({ id: REPO_ID }, { orgId: ORG_ID })).resolves.toEqual({
      repoId: REPO_ID,
      status: "queued",
      taskName: "repo.sync.local",
      jobKey: `repo.sync.local:${REPO_ID}`,
    });
    await expect(controller.getRepositoryStatus({ id: REPO_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ repoId: REPO_ID, status: "synced" }),
    );
    await expect(controller.getRepositoryTree({ id: REPO_ID }, {
      orgId: ORG_ID,
      branch: "main",
      dir: "docs",
    })).resolves.toEqual({
      repoId: REPO_ID,
      branch: "main",
      dir: "docs",
      entries: [{ path: "docs/guide.txt", kind: "file", sizeBytes: 42 }],
    });
    await expect(controller.getRepositoryFile({ id: REPO_ID }, {
      orgId: ORG_ID,
      branch: "main",
      path: "docs/guide.txt",
    })).resolves.toEqual({
      repoId: REPO_ID,
      branch: "main",
      path: "docs/guide.txt",
      mimeType: "text/plain",
      encoding: "utf8",
      content: "guide\n",
    });
    await expect(controller.unregisterRepository({ id: REPO_ID }, { orgId: ORG_ID })).resolves.toBeUndefined();
    await expect(branchController.listBranches({ orgId: ORG_ID, repoId: REPO_ID, limit: "20" })).resolves.toEqual([
      expect.objectContaining({
        id: "branch-1",
        lastSeenAt: "2026-05-14T00:00:00.000Z",
      }),
    ]);
    await expect(branchController.getBranch({ id: "branch-1" }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: "branch-1", name: "main" }),
    );
    await expect(commitController.listCommits({ orgId: ORG_ID, repoId: REPO_ID, branch: "main", limit: "20" }))
      .resolves.toEqual([
        expect.objectContaining({
          id: "commit-1",
          committedAt: "2026-05-14T00:00:00.000Z",
        }),
      ]);
    await expect(commitController.getCommit({ id: "commit-1" }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: "commit-1", sha: "a".repeat(40) }),
    );

    expect(list).toHaveBeenCalledWith({ orgId: ORG_ID, includeArchived: true });
    expect(register).toHaveBeenCalledWith({
      orgId: ORG_ID,
      name: "Repo created",
      slug: "repo-created",
      kind: "local",
      localPath: "/workspace/repo-created",
      remoteUrl: undefined,
      projectId: "project-1",
      defaultBranch: "main",
    });
    expect(get).toHaveBeenCalledWith({ orgId: ORG_ID, repoId: REPO_ID });
    expect(sync).toHaveBeenCalledWith({ orgId: ORG_ID });
    expect(syncRepo).toHaveBeenCalledWith({ orgId: ORG_ID, repoId: REPO_ID });
    expect(statusRepo).toHaveBeenCalledWith({ orgId: ORG_ID, repoId: REPO_ID });
    expect(getFileTree).toHaveBeenCalledWith({ orgId: ORG_ID, repoId: REPO_ID, branch: "main", dir: "docs" });
    expect(getFileContent).toHaveBeenCalledWith({
      orgId: ORG_ID,
      repoId: REPO_ID,
      branch: "main",
      path: "docs/guide.txt",
    });
    expect(unregister).toHaveBeenCalledWith({ orgId: ORG_ID, repoId: REPO_ID });
    expect(listBranches).toHaveBeenCalledWith({ orgId: ORG_ID, repoId: REPO_ID, limit: 20 });
    expect(getBranch).toHaveBeenCalledWith({ orgId: ORG_ID, id: "branch-1" });
    expect(listCommits).toHaveBeenCalledWith({ orgId: ORG_ID, repoId: REPO_ID, branch: "main", limit: 20 });
    expect(getCommit).toHaveBeenCalledWith({ orgId: ORG_ID, id: "commit-1" });
  });

  test("rejects repository file browse paths that escape the repo", async () => {
    const controller = new RepositoryPublicApiController(
      new RepositoryPublicApiService({
        featuresEnv: "public-api",
        orgId: ORG_ID,
        application: {
          list: async () => [],
          syncRepo: async () => null,
          statusRepo: async () => null,
          getFileTree: async () => ({ entries: [] }),
          getFileContent: async () => ({ content: "" }),
        },
      }),
    );

    await expect(controller.getRepositoryTree({ id: REPO_ID }, { orgId: ORG_ID, dir: "../secrets" }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getRepositoryFile({ id: REPO_ID }, { orgId: ORG_ID, path: "/etc/passwd" }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getRepositoryFile({ id: REPO_ID }, { orgId: ORG_ID, path: "docs\\secret.txt" }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  test("returns Nest 404 when repository sync or status cannot find the repository", async () => {
    const service = new RepositoryPublicApiService({
      featuresEnv: "public-api",
      orgId: ORG_ID,
      application: {
        list: async () => [],
        syncRepo: async () => null,
        statusRepo: async () => ({ repoId: REPO_ID, orgId: OTHER_ORG_ID, status: "synced" }),
        getBranch: async () => null,
        getCommit: async () => null,
      },
    });
    const controller = new RepositoryPublicApiController(service);
    const branchController = new RepositoryBranchPublicApiController(service);
    const commitController = new RepositoryCommitPublicApiController(service);

    await expect(controller.syncRepository({ id: REPO_ID }, { orgId: ORG_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.getRepositoryStatus({ id: REPO_ID }, { orgId: ORG_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(branchController.getBranch({ id: "missing-branch" }, { orgId: ORG_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(commitController.getCommit({ id: "missing-commit" }, { orgId: ORG_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("keeps request validation at the Nest boundary", () => {
    const params = Object.assign(new RepositoryIdParamsDto(), { id: REPO_ID });
    const invalidParams = Object.assign(new RepositoryIdParamsDto(), { id: "not-a-uuid" });
    const query = Object.assign(new RepositoryListQueryDto(), { orgId: ORG_ID, includeArchived: "true" });
    const invalidQuery = Object.assign(new RepositoryListQueryDto(), { orgId: "" });
    const context = Object.assign(new RepositoryRequestContextDto(), { orgId: ORG_ID });
    const invalidContext = Object.assign(new RepositoryRequestContextDto(), { orgId: "" });
    const readModelParams = Object.assign(new RepositoryReadModelIdParamsDto(), { id: "branch-1" });
    const invalidReadModelParams = Object.assign(new RepositoryReadModelIdParamsDto(), { id: "" });
    const readModelQuery = Object.assign(new RepositoryReadModelListQueryDto(), {
      orgId: ORG_ID,
      repoId: REPO_ID,
      branch: "main",
      limit: "20",
    });
    const treeQuery = Object.assign(new RepositoryTreeQueryDto(), {
      orgId: ORG_ID,
      branch: "main",
      dir: "docs",
    });
    const fileQuery = Object.assign(new RepositoryFileQueryDto(), {
      orgId: ORG_ID,
      branch: "main",
      path: "docs/guide.txt",
    });
    const invalidFileQuery = Object.assign(new RepositoryFileQueryDto(), {
      orgId: ORG_ID,
      path: "",
    });
    const body = Object.assign(new RepositoryCreateBodyDto(), {
      orgId: ORG_ID,
      name: "Repo",
      slug: "repo",
      kind: "local",
      localPath: "/workspace/repo",
      projectId: "project-1",
      defaultBranch: "main",
    });
    const invalidBody = Object.assign(new RepositoryCreateBodyDto(), { orgId: "", name: "", kind: "unknown" });

    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(invalidQuery).map((error) => error.property)).toEqual(["orgId"]);
    expect(validateSync(context)).toHaveLength(0);
    expect(validateSync(invalidContext).map((error) => error.property)).toEqual(["orgId"]);
    expect(validateSync(readModelParams)).toHaveLength(0);
    expect(validateSync(invalidReadModelParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(readModelQuery)).toHaveLength(0);
    expect(validateSync(treeQuery)).toHaveLength(0);
    expect(validateSync(fileQuery)).toHaveLength(0);
    expect(validateSync(invalidFileQuery).map((error) => error.property)).toEqual(["path"]);
    expect(validateSync(body)).toHaveLength(0);
    expect(validateSync(invalidBody).map((error) => error.property)).toEqual(["orgId", "name", "kind"]);
  });
});
