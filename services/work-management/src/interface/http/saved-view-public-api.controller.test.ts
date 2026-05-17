import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  CreateSavedViewBodyDto,
  PatchSavedViewBodyDto,
  SavedViewIdParamsDto,
  SavedViewPublicApiController,
  SavedViewPublicApiModule,
  SavedViewPublicApiService,
} from "@work-management/interface/http/saved-view-public-api.controller.ts";

const VIEW_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ORG_ID = "11111111-1111-4111-8111-111111111111";

function savedView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VIEW_ID,
    orgId: ORG_ID,
    name: "My view",
    scope: "private",
    viewType: "list",
    createdAt: new Date("2026-05-14T00:00:00.000Z"),
    ...overrides,
  };
}

describe("saved-view public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SavedViewPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(SavedViewPublicApiController);
    expect(appImports).toContain(SavedViewPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, SavedViewPublicApiController)).toBe("api/v1/saved-views");
    expect(Reflect.getMetadata(PATH_METADATA, SavedViewPublicApiController.prototype.listSavedViews)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, SavedViewPublicApiController.prototype.listSavedViews)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SavedViewPublicApiController.prototype.createSavedView)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SavedViewPublicApiController.prototype.getSavedView)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, SavedViewPublicApiController.prototype.getSavedView)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SavedViewPublicApiController.prototype.patchSavedView)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, SavedViewPublicApiController.prototype.deleteSavedView)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, SavedViewPublicApiController.prototype.deleteSavedView)).toBe(
      RequestMethod.DELETE,
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new SavedViewPublicApiController(new SavedViewPublicApiService());

      await expect(controller.listSavedViews()).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the application facade is not configured", async () => {
    const controller = new SavedViewPublicApiController(
      new SavedViewPublicApiService({ featuresEnv: "public-api" }),
    );

    await expect(controller.listSavedViews()).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  test("delegates saved-view operations to the application facade", async () => {
    const list = mock(async () => [savedView()]);
    const create = mock(async () => savedView({ name: "Created", scope: "project", viewType: "kanban" }));
    const get = mock(async () => savedView());
    const update = mock(async () => savedView({ name: "Updated", viewType: "table" }));
    const remove = mock(async () => savedView());
    const controller = new SavedViewPublicApiController(
      new SavedViewPublicApiService({
        featuresEnv: "public-api",
        application: { list, create, get, update, delete: remove },
      }),
    );

    await expect(controller.listSavedViews()).resolves.toEqual([
      expect.objectContaining({ id: VIEW_ID, createdAt: "2026-05-14T00:00:00.000Z" }),
    ]);
    await expect(controller.createSavedView({ orgId: ORG_ID, name: "Created" })).resolves.toEqual(
      expect.objectContaining({ name: "Created", scope: "project", viewType: "kanban" }),
    );
    await expect(controller.getSavedView({ id: VIEW_ID })).resolves.toEqual(expect.objectContaining({ id: VIEW_ID }));
    await expect(controller.patchSavedView({ id: VIEW_ID }, { name: "Updated", viewType: "table" })).resolves.toEqual(
      expect.objectContaining({ name: "Updated", viewType: "table" }),
    );
    await expect(controller.deleteSavedView({ id: VIEW_ID })).resolves.toBeUndefined();

    expect(list).toHaveBeenCalledWith({});
    expect(create).toHaveBeenCalledWith({ orgId: ORG_ID, name: "Created", scope: "private", viewType: "list" });
    expect(get).toHaveBeenCalledWith({ id: VIEW_ID });
    expect(update).toHaveBeenCalledWith({ id: VIEW_ID, name: "Updated", viewType: "table" });
    expect(remove).toHaveBeenCalledWith({ id: VIEW_ID });
  });

  test("returns a Nest 404 when a saved-view delete facade lookup returns nothing", async () => {
    const controller = new SavedViewPublicApiController(
      new SavedViewPublicApiService({
        featuresEnv: "public-api",
        application: {
          list: async () => [],
          create: async () => savedView(),
          get: async () => null,
          update: async () => null,
          delete: async () => null,
        },
      }),
    );

    await expect(controller.getSavedView({ id: VIEW_ID })).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.patchSavedView({ id: VIEW_ID }, { name: "Updated" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.deleteSavedView({ id: VIEW_ID })).rejects.toBeInstanceOf(NotFoundException);
  });

  test("keeps request validation at the Nest boundary", () => {
    const params = Object.assign(new SavedViewIdParamsDto(), { id: VIEW_ID });
    const invalidParams = Object.assign(new SavedViewIdParamsDto(), { id: "not-a-uuid" });
    const body = Object.assign(new CreateSavedViewBodyDto(), {
      orgId: ORG_ID,
      name: "My view",
      scope: "private",
      viewType: "list",
    });
    const invalidBody = Object.assign(new CreateSavedViewBodyDto(), {
      orgId: "not-a-uuid",
      name: "",
      scope: "shared",
      viewType: "grid",
    });
    const patch = Object.assign(new PatchSavedViewBodyDto(), { name: "Updated", viewType: "table" });
    const invalidPatch = Object.assign(new PatchSavedViewBodyDto(), { name: "", scope: "shared", viewType: "grid" });

    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(body)).toHaveLength(0);
    expect(validateSync(invalidBody).map((error) => error.property).sort()).toEqual([
      "name",
      "orgId",
      "scope",
      "viewType",
    ]);
    expect(validateSync(patch)).toHaveLength(0);
    expect(validateSync(invalidPatch).map((error) => error.property).sort()).toEqual(["name", "scope", "viewType"]);
  });
});
