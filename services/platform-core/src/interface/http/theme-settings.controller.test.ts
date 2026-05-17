import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { BadRequestException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import { THEME_PROFILE_DEFAULTS } from "@platform-core/application/theme-settings.ts";
import {
  ThemeSettingsApiController,
  ThemeSettingsApiModule,
  ThemeSettingsApiService,
  ThemeSettingsQueryDto,
  ThemeTokenParamsDto,
  ThemeTokenUpsertDto,
} from "@platform-core/interface/http/theme-settings.controller.ts";

describe("theme settings Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ThemeSettingsApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(ThemeSettingsApiController);
    expect(appImports).toContain(ThemeSettingsApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, ThemeSettingsApiController)).toBe("api/v1/settings/theme");
    expect(Reflect.getMetadata(METHOD_METADATA, ThemeSettingsApiController.prototype.getProfile)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, ThemeSettingsApiController.prototype.updateProfile)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(PATH_METADATA, ThemeSettingsApiController.prototype.listTokens)).toBe("tokens");
    expect(Reflect.getMetadata(METHOD_METADATA, ThemeSettingsApiController.prototype.setToken)).toBe(RequestMethod.PUT);
  });

  test("hides routes when the public API feature is off", async () => {
    const controller = new ThemeSettingsApiController(new ThemeSettingsApiService({ featuresEnv: "" }));

    await expect(controller.getProfile({ orgId: "org-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("delegates theme profile and token operations to the store", async () => {
    const defaultProfile = { ...THEME_PROFILE_DEFAULTS };
    const oceanProfile = { ...THEME_PROFILE_DEFAULTS, accentHue: 210, preset: "ocean" as const };
    const defaultAccentToken = { key: "theme.accent" as const, value: "#6D28D9", defaultValue: "#6D28D9" };
    const updatedAccentToken = { key: "theme.accent" as const, value: "#2563EB", defaultValue: "#6D28D9" };
    const store = {
      getProfile: mock(async () => defaultProfile),
      updateProfile: mock(async () => oceanProfile),
      listTokens: mock(async () => [defaultAccentToken]),
      getToken: mock(async () => defaultAccentToken),
      setToken: mock(async () => updatedAccentToken),
    };
    const controller = new ThemeSettingsApiController(
      new ThemeSettingsApiService({ featuresEnv: "public-api" }, store),
    );

    await expect(controller.getProfile({ orgId: "org-1", userId: "user-1" })).resolves.toEqual(defaultProfile);
    await expect(controller.updateProfile({
      orgId: "org-1",
      userId: "user-1",
      accentHue: 210,
      preset: "ocean",
    })).resolves.toEqual(oceanProfile);
    await expect(controller.listTokens({ orgId: "org-1", userId: "user-1" })).resolves.toHaveLength(1);
    await expect(controller.getToken({ key: "accent" }, { orgId: "org-1", userId: "user-1" })).resolves
      .toMatchObject({ key: "theme.accent" });
    await expect(controller.setToken(
      { key: "accent" },
      { orgId: "org-1", userId: "user-1", value: "#2563EB" },
    )).resolves.toMatchObject({ value: "#2563EB" });
    await expect(controller.setToken(
      { key: "accent" },
      { orgId: "org-1", userId: "user-1", value: "purple" },
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(store.getProfile).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" });
    expect(store.updateProfile).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" }, {
      accentHue: 210,
      preset: "ocean",
    });
    expect(store.getToken).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" }, "theme.accent");
    expect(store.setToken).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" }, "theme.accent", "#2563EB");
  });

  test("keeps request validation at the Nest boundary", () => {
    const query = Object.assign(new ThemeSettingsQueryDto(), { orgId: "org-1", userId: "user-1" });
    const invalidQuery = Object.assign(new ThemeSettingsQueryDto(), { orgId: "", userId: "" });
    const params = Object.assign(new ThemeTokenParamsDto(), { key: "accent" });
    const body = Object.assign(new ThemeTokenUpsertDto(), {
      orgId: "org-1",
      userId: "user-1",
      value: "#2563EB",
    });

    expect(validateSync(query)).toEqual([]);
    expect(validateSync(invalidQuery).map((error) => error.property)).toEqual(["orgId", "userId"]);
    expect(validateSync(params)).toEqual([]);
    expect(validateSync(body)).toEqual([]);
  });
});
