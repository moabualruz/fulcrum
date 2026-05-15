import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  InternalServerErrorException,
  NotFoundException,
  RequestMethod,
  UnauthorizedException,
} from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import {
  SearchClickBodyDto,
  SearchCreateSavedRequestDto,
  SearchDeleteSavedQueryDto,
  SearchListSavedQueryDto,
  type SearchPublicApplication,
  SearchPublicApiController,
  SearchPublicApiModule,
  SearchPublicApiService,
  SearchQueryDto,
  SearchSavedIdParamsDto,
  SearchSnapshotQueryDto,
  SearchSuggestQueryDto,
  SearchUpdateSavedRequestDto,
} from "@knowledge-workspace/interface/http/search-public-api.controller.ts";

async function stubAuth(header: string | undefined): Promise<string | null> {
  if (header === "Bearer valid-token") return "user1";
  return null;
}

function application(): SearchPublicApplication {
  const saved = {
    id: "saved-1",
    org_id: "org-1",
    user_id: "user1",
    name: "my saved",
    query_json: JSON.stringify({ text: "test" }),
    scope: "private" as const,
    project_id: null,
    created_at: "2026-05-14T00:00:00.000Z",
    updated_at: "2026-05-14T00:00:00.000Z",
  };
  return {
    search: async () => [{
      id: "hit-1",
      source_kind: "page",
      source_id: "page-1",
      title: "kernel task",
      body: "kernel description",
      score: 1,
      updated_at: "2026-05-14T00:00:00.000Z",
    }],
    suggest: async () => ["kernel task"],
    listSavedSearches: async () => [saved],
    createSavedSearch: async (input) => ({
      ...saved,
      org_id: input.orgId,
      user_id: input.userId,
      name: input.name,
      query_json: JSON.stringify(input.queryJson),
      scope: input.scope,
      project_id: input.projectId ?? null,
    }),
    updateSavedSearch: async (input) => ({
      ...saved,
      org_id: input.orgId,
      user_id: input.userId,
      name: input.name ?? saved.name,
      query_json: JSON.stringify(input.queryJson ?? { text: "test" }),
      scope: input.scope ?? saved.scope,
      project_id: input.projectId ?? saved.project_id,
    }),
    deleteSavedSearch: async (input) => ({ deleted: true, id: input.id }),
    recordClick: async () => ({ recorded: true }),
    snapshot: async () => ({ snapshot: "{\"entries\":[]}" }),
  };
}

describe("search public Nest API", () => {
  test("is wired as a Nest controller without the product-store Hono API", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SearchPublicApiModule) as unknown[];

    expect(controllers).toContain(SearchPublicApiController);
    expect(Reflect.getMetadata(PATH_METADATA, SearchPublicApiController)).toBe("api/v1/search");
    expect(Reflect.getMetadata(METHOD_METADATA, SearchPublicApiController.prototype.search)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SearchPublicApiController.prototype.suggest)).toBe(
      "suggest",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SearchPublicApiController.prototype.suggest)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SearchPublicApiController.prototype.listSavedSearches)).toBe(
      "saved",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SearchPublicApiController.prototype.listSavedSearches)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SearchPublicApiController.prototype.createSavedSearch)).toBe(
      "saved",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SearchPublicApiController.prototype.createSavedSearch)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SearchPublicApiController.prototype.updateSavedSearch)).toBe(
      "saved/:id",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SearchPublicApiController.prototype.updateSavedSearch)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SearchPublicApiController.prototype.deleteSavedSearch)).toBe(
      "saved/:id",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SearchPublicApiController.prototype.deleteSavedSearch)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SearchPublicApiController.prototype.recordClick)).toBe(
      "click",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SearchPublicApiController.prototype.recordClick)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SearchPublicApiController.prototype.snapshot)).toBe(
      "snapshot",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SearchPublicApiController.prototype.snapshot)).toBe(
      RequestMethod.GET,
    );
  });

  test("returns a Nest 404 when the public API feature flag is disabled", async () => {
    const controller = new SearchPublicApiController(
      new SearchPublicApiService({ application: application(), featuresEnv: "", authenticate: stubAuth }),
    );

    await expect(
      controller.search({ q: "foo", org_id: "x" }, "Bearer valid-token"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new SearchPublicApiController(new SearchPublicApiService());

      await expect(
        controller.search({ q: "foo", org_id: "x" }, "Bearer valid-token"),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the search store is not configured", async () => {
    const original = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "public-api";
    try {
      const controller = new SearchPublicApiController(new SearchPublicApiService());

      await expect(
        controller.search({ q: "foo", org_id: "x" }, "Bearer valid-token"),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("returns a Nest 401 when authorization is missing or invalid", async () => {
    const controller = new SearchPublicApiController(
      new SearchPublicApiService({ application: application(), featuresEnv: "public-api", authenticate: stubAuth }),
    );

    await expect(controller.search({ q: "foo", org_id: "x" }, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.search({ q: "foo", org_id: "x" }, "Bearer bad")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  test("searches indexed documents and returns suggestions", async () => {
    const controller = new SearchPublicApiController(
      new SearchPublicApiService({ application: application(), featuresEnv: "public-api", authenticate: stubAuth }),
    );

    const hits = await controller.search({ q: "kernel", org_id: "org-1" }, "Bearer valid-token");
    expect(hits[0]).toMatchObject({ title: "kernel task" });

    const suggestions = await controller.suggest({ prefix: "ker", org_id: "org-1" }, "Bearer valid-token");
    expect(suggestions.suggestions).toContain("kernel task");
  });

  test("creates and lists saved searches", async () => {
    const controller = new SearchPublicApiController(
      new SearchPublicApiService({ application: application(), featuresEnv: "public-api", authenticate: stubAuth }),
    );

    const created = await controller.createSavedSearch({
      org_id: "org-1",
      user_id: "user1",
      name: "my saved",
      query_json: { text: "test" },
      scope: "private",
    }, "Bearer valid-token");
    expect(created.name).toBe("my saved");

    const list = await controller.listSavedSearches(
      { org_id: "org-1", user_id: "user1" },
      "Bearer valid-token",
    );
    expect(list).toHaveLength(1);
  });

  test("updates, deletes, records clicks, and snapshots search state", async () => {
    const controller = new SearchPublicApiController(
      new SearchPublicApiService({ application: application(), featuresEnv: "public-api", authenticate: stubAuth }),
    );

    const updated = await controller.updateSavedSearch({
      id: "saved-1",
    }, {
      org_id: "org-1",
      user_id: "user1",
      name: "revised",
      query_json: { text: "revised" },
      scope: "project",
      project_id: "project-1",
    }, "Bearer valid-token");
    expect(updated).toMatchObject({
      id: "saved-1",
      name: "revised",
      query_json: JSON.stringify({ text: "revised" }),
      scope: "project",
      project_id: "project-1",
    });

    await expect(controller.deleteSavedSearch(
      { id: "saved-1" },
      { org_id: "org-1", user_id: "user1" },
      "Bearer valid-token",
    )).resolves.toBeUndefined();
    await expect(controller.recordClick({
      org_id: "org-1",
      user_id: "user1",
      query: "kernel",
      result_id: "hit-1",
      result_kind: "page",
      position: 1,
    }, "Bearer valid-token")).resolves.toEqual({ recorded: true });
    await expect(controller.snapshot({
      org_id: "org-1",
    }, "Bearer valid-token")).resolves.toEqual({ snapshot: "{\"entries\":[]}" });
  });

  test("keeps request validation at the Nest boundary", () => {
    const query = Object.assign(new SearchQueryDto(), { q: "kernel", org_id: "org_1", limit: 25 });
    const invalidQuery = Object.assign(new SearchQueryDto(), { q: "", org_id: "" });
    const suggest = Object.assign(new SearchSuggestQueryDto(), { prefix: "ker", org_id: "org_1" });
    const savedList = Object.assign(new SearchListSavedQueryDto(), { org_id: "org_1", user_id: "user1" });
    const savedCreate = Object.assign(new SearchCreateSavedRequestDto(), {
      org_id: "org_1",
      user_id: "user1",
      name: "Inbox",
      query_json: { q: "inbox" },
      scope: "private",
    });
    const savedParams = Object.assign(new SearchSavedIdParamsDto(), { id: "saved-1" });
    const savedUpdate = Object.assign(new SearchUpdateSavedRequestDto(), {
      org_id: "org_1",
      user_id: "user1",
      name: "Inbox revised",
      query_json: { q: "inbox" },
      scope: "project",
    });
    const savedDelete = Object.assign(new SearchDeleteSavedQueryDto(), { org_id: "org_1", user_id: "user1" });
    const click = Object.assign(new SearchClickBodyDto(), {
      org_id: "org_1",
      user_id: "user1",
      query: "kernel",
      result_id: "hit-1",
      result_kind: "page",
      position: 1,
    });
    const snapshot = Object.assign(new SearchSnapshotQueryDto(), { org_id: "org_1" });

    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(invalidQuery).map((error) => error.property)).toEqual(["q", "org_id"]);
    expect(validateSync(suggest)).toHaveLength(0);
    expect(validateSync(savedList)).toHaveLength(0);
    expect(validateSync(savedCreate)).toHaveLength(0);
    expect(validateSync(savedParams)).toHaveLength(0);
    expect(validateSync(savedUpdate)).toHaveLength(0);
    expect(validateSync(savedDelete)).toHaveLength(0);
    expect(validateSync(click)).toHaveLength(0);
    expect(validateSync(snapshot)).toHaveLength(0);
  });
});
