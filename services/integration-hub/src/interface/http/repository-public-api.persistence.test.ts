import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  INTEGRATION_HUB_REPOSITORY_ENTITIES,
  IntegrationRepositoryBranchEntity,
  IntegrationRepositoryCommitEntity,
  IntegrationRepositoryEntity,
} from "@integration-hub/infrastructure/database/repository.entities.ts";
import { IntegrationRepositories1778623200006 } from "@integration-hub/infrastructure/database/repository.migration.ts";
import { RepositoryPublicStore } from "@integration-hub/infrastructure/database/repository-public-store.ts";
import {
  RepositoryBranchPublicApiController,
  RepositoryCommitPublicApiController,
  RepositoryPublicApiController,
  RepositoryPublicApiService,
} from "@integration-hub/interface/http/repository-public-api.controller.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const LOCAL_REPO_ID = "44444444-4444-4444-8444-444444444444";
const REMOTE_REPO_ID = "55555555-5555-4555-8555-555555555555";
const BRANCH_ID = "branch-main";
const COMMIT_ID = "commit-main";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
});

async function assertRepositoryPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: INTEGRATION_HUB_REPOSITORY_ENTITIES,
      migrations: [IntegrationRepositories1778623200006],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "IntegrationRepositories1778623200006",
    ]);

    await dataSource.getRepository(IntegrationRepositoryEntity).save([
      {
        id: LOCAL_REPO_ID,
        orgId: ORG_ID,
        projectId: null,
        name: "Local repo",
        slug: `local-${source}`,
        kind: "local",
        localPath: "/workspace/local",
        remoteUrl: null,
        defaultBranch: "main",
        currentBranch: "main",
        lastSyncAt: new Date("2026-05-14T00:00:00.000Z"),
        syncStatus: "idle",
        lastTouchedAt: new Date("2026-05-14T00:00:00.000Z"),
        archived: false,
        traceId: `trace-repo-${source}`,
      },
      {
        id: REMOTE_REPO_ID,
        orgId: ORG_ID,
        projectId: null,
        name: "Archived repo",
        slug: `archived-${source}`,
        kind: "remote",
        localPath: null,
        remoteUrl: "https://example.invalid/archived.git",
        defaultBranch: "main",
        currentBranch: null,
        lastSyncAt: null,
        syncStatus: "idle",
        lastTouchedAt: null,
        archived: true,
        traceId: `trace-archived-${source}`,
      },
    ]);
    await dataSource.getRepository(IntegrationRepositoryBranchEntity).save({
      id: BRANCH_ID,
      orgId: ORG_ID,
      repoId: LOCAL_REPO_ID,
      name: "main",
      headSha: "a".repeat(40),
      isCurrent: true,
      isDefault: true,
      source: "local",
      lastSeenAt: new Date("2026-05-14T00:00:00.000Z"),
      traceId: `trace-branch-${source}`,
    });
    await dataSource.getRepository(IntegrationRepositoryCommitEntity).save({
      id: COMMIT_ID,
      orgId: ORG_ID,
      repoId: LOCAL_REPO_ID,
      sha: "a".repeat(40),
      branch: "main",
      message: "Initial commit",
      authorName: "Fulcrum Test",
      authorEmail: "test@example.invalid",
      committedAt: new Date("2026-05-14T00:00:00.000Z"),
      parentShas: [],
      traceId: `trace-commit-${source}`,
    });

    const service = new RepositoryPublicApiService(
      { featuresEnv: "public-api", orgId: ORG_ID },
      new RepositoryPublicStore(dataSource),
    );
    const controller = new RepositoryPublicApiController(service);
    const branchController = new RepositoryBranchPublicApiController(service);
    const commitController = new RepositoryCommitPublicApiController(service);

    await expect(controller.listRepositories({ orgId: ORG_ID })).resolves.toEqual([
      expect.objectContaining({
        id: LOCAL_REPO_ID,
        orgId: ORG_ID,
        lastSyncAt: "2026-05-14T00:00:00.000Z",
        traceId: `trace-repo-${source}`,
      }),
    ]);
    await expect(controller.listRepositories({ orgId: ORG_ID, includeArchived: "true" })).resolves.toHaveLength(2);
    await expect(controller.loadRepository({ id: LOCAL_REPO_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: LOCAL_REPO_ID, name: "Local repo" }),
    );
    await expect(branchController.listBranches({ orgId: ORG_ID, repoId: LOCAL_REPO_ID, limit: "20" }))
      .resolves.toEqual([
        expect.objectContaining({
          id: BRANCH_ID,
          orgId: ORG_ID,
          repoId: LOCAL_REPO_ID,
          name: "main",
          isCurrent: true,
          isDefault: true,
          lastSeenAt: "2026-05-14T00:00:00.000Z",
          traceId: `trace-branch-${source}`,
        }),
      ]);
    await expect(branchController.getBranch({ id: BRANCH_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: BRANCH_ID, name: "main" }),
    );
    await expect(commitController.listCommits({ orgId: ORG_ID, repoId: LOCAL_REPO_ID, branch: "main", limit: "20" }))
      .resolves.toEqual([
        expect.objectContaining({
          id: COMMIT_ID,
          orgId: ORG_ID,
          repoId: LOCAL_REPO_ID,
          sha: "a".repeat(40),
          committedAt: "2026-05-14T00:00:00.000Z",
          traceId: `trace-commit-${source}`,
        }),
      ]);
    await expect(commitController.getCommit({ id: COMMIT_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: COMMIT_ID, sha: "a".repeat(40) }),
    );
    const created = await controller.registerRepository({
      orgId: ORG_ID,
      name: `New repo ${source}`,
      slug: `new-${source}`,
      kind: "remote",
      remoteUrl: "https://example.invalid/new.git",
      projectId: "project-1",
      defaultBranch: "main",
    });
    expect(created).toEqual(expect.objectContaining({
      id: expect.any(String),
      orgId: ORG_ID,
      name: `New repo ${source}`,
      remoteUrl: "https://example.invalid/new.git",
      traceId: expect.any(String),
    }));
    await expect(controller.syncRepositories({ orgId: ORG_ID })).resolves.toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({ repoId: LOCAL_REPO_ID, status: "queued" }),
      ]),
    });
    await expect(controller.syncRepository({ id: LOCAL_REPO_ID }, { orgId: ORG_ID })).resolves.toEqual({
      repoId: LOCAL_REPO_ID,
      status: "queued",
      taskName: "repo.sync.local",
      jobKey: `repo.sync.local:${LOCAL_REPO_ID}`,
    });
    await expect(controller.getRepositoryStatus({ id: LOCAL_REPO_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({
        repoId: LOCAL_REPO_ID,
        orgId: ORG_ID,
        status: "running",
        syncStatus: "syncing",
      }),
    );
    await expect(controller.unregisterRepository({ id: LOCAL_REPO_ID }, { orgId: ORG_ID })).resolves.toBeUndefined();
    await expect(controller.loadRepository({ id: LOCAL_REPO_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: LOCAL_REPO_ID, archived: true }),
    );
  } finally {
    await dataSource.destroy();
  }
}

describe("repository public API TypeORM persistence", () => {
  test("serves repository list, sync, and status through PGlite socket", async () => {
    await assertRepositoryPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves repository list, sync, and status through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertRepositoryPublicApiRoundTrip("postgres", postgres.url);
  });
});
