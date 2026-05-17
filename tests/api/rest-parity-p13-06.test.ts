import "reflect-metadata";

import { describe, expect, it } from "bun:test";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import {
  RepositoryPublicApiController,
  RepositoryPublicApiService,
} from "@integration-hub/interface/http/repository-public-api.controller.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const REPO_ID = "44444444-4444-4444-8444-444444444444";

describe("REST parity (repos)", () => {
  it("repos are exposed through the Nest public API controller", () => {
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController)).toBe("api/v1/repos");
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.listRepositories)).toBe("/");
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.syncRepository)).toBe(":id/sync");
    expect(Reflect.getMetadata(PATH_METADATA, RepositoryPublicApiController.prototype.getRepositoryStatus)).toBe(
      ":id/status",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, RepositoryPublicApiController.prototype.listRepositories)).toBe(0);
  });

  it("GET repos delegates to the configured repository facade", async () => {
    const controller = new RepositoryPublicApiController(
      new RepositoryPublicApiService({
        featuresEnv: "public-api",
        orgId: ORG_ID,
        application: {
          list: async () => [
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
              lastTouchedAt: null,
              archived: false,
            },
          ],
          syncRepo: async () => null,
          statusRepo: async () => null,
        },
      }),
    );

    const body = await controller.listRepositories({ orgId: ORG_ID });

    expect(body).toEqual([expect.objectContaining({ id: REPO_ID, orgId: ORG_ID })]);
  });
});
