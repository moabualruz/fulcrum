import { describe, expect, mock, test } from "bun:test";

import { MODULE_METADATA, PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  SettingsPublicApiController,
  SettingsPublicApiModule,
  SettingsPublicApiService,
  SettingsScopeQueryDto,
  SettingsValueDto,
} from "@platform-core/interface/http/settings-public-api.controller.ts";

describe("tenant settings Nest API", () => {
  test("is mounted as a Nest controller on the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SettingsPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(SettingsPublicApiController);
    expect(appImports).toContain(SettingsPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, SettingsPublicApiController)).toBe("api/v1/settings");
    expect(Reflect.getMetadata(METHOD_METADATA, SettingsPublicApiController.prototype.listSettings)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, SettingsPublicApiController.prototype.getSetting)).toBe(":key");
    expect(Reflect.getMetadata(METHOD_METADATA, SettingsPublicApiController.prototype.setSetting)).toBe(RequestMethod.PUT);
  });

  test("delegates list, get, and set through the application settings port", async () => {
    const row = { id: "setting-1", orgId: "org-1", key: "theme", value: "dark" };
    const rows = [row];
    const store = {
      list: mock(async () => rows),
      get: mock(async () => row),
      set: mock(async () => ({ ...row, value: "light" })),
    };
    const controller = new SettingsPublicApiController(
      new SettingsPublicApiService({ featuresEnv: "" }, store),
    );

    await expect(controller.listSettings({ orgId: "org-1" })).resolves.toEqual(rows);
    await expect(controller.getSetting({ key: "theme" }, { orgId: "org-1" })).resolves.toEqual(row);
    await expect(controller.setSetting({ key: "theme" }, { orgId: "org-1", value: "light" })).resolves.toEqual({
      ...row,
      value: "light",
    });
    expect(store.set).toHaveBeenCalledWith({ orgId: "org-1", key: "theme", value: "light" });
  });

  test("validates required tenant setting scope", () => {
    const valid = Object.assign(new SettingsScopeQueryDto(), { orgId: "org-1" });
    const invalid = Object.assign(new SettingsValueDto(), { orgId: "", value: "dark" });

    expect(validateSync(valid)).toEqual([]);
    expect(validateSync(invalid).map((error) => error.property)).toEqual(["orgId"]);
  });
});
