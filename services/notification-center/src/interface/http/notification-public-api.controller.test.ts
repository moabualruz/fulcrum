import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  NotificationChannelConfigBodyDto,
  NotificationChannelParamsDto,
  NotificationListQueryDto,
  NotificationMarkReadParamsDto,
  NotificationMuteBodyDto,
  NotificationMuteParamsDto,
  NotificationPublicApiController,
  NotificationPublicApiModule,
  NotificationPublicApiService,
  NotificationQuietHoursSetBodyDto,
  NotificationRuleCreateBodyDto,
  NotificationRuleParamsDto,
  NotificationRulePatchBodyDto,
} from "@notification-center/interface/http/notification-public-api.controller.ts";

describe("notification public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, NotificationPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(NotificationPublicApiController);
    expect(appImports).toContain(NotificationPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController)).toBe("api/v1/notifications");
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.listNotifications)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.listNotifications)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.markRead)).toBe(
      ":id/mark-read",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.markRead)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.unreadCount)).toBe(
      "unread-count",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.unreadCount)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.markAllRead)).toBe(
      "mark-all-read",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.markAllRead)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.getSettings)).toBe(
      "settings",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.getSettings)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.configureChannel)).toBe(
      "channels/:channel",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.configureChannel)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.testChannel)).toBe(
      "channels/:channel/test",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.testChannel)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.listRules)).toBe("rules");
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.listRules)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.getRule)).toBe("rules/:id");
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.getRule)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.createRule)).toBe("rules");
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.createRule)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.updateRule)).toBe("rules/:id");
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.updateRule)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.deleteRule)).toBe("rules/:id");
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.deleteRule)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.getQuietHours)).toBe(
      "quiet-hours",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.getQuietHours)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.setQuietHours)).toBe(
      "quiet-hours",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.setQuietHours)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.listMutes)).toBe("mutes");
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.listMutes)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.mute)).toBe("mutes");
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.mute)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPublicApiController.prototype.unmute)).toBe(
      "mutes/:subjectKind/:subjectId",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, NotificationPublicApiController.prototype.unmute)).toBe(
      RequestMethod.DELETE,
    );
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new NotificationPublicApiController(new NotificationPublicApiService());

      await expect(controller.listNotifications({ orgId: "org-1", userId: "user-1" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but the application facade is not configured", async () => {
    const original = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "public-api";
    try {
      const controller = new NotificationPublicApiController(new NotificationPublicApiService());

      await expect(controller.listNotifications({ orgId: "org-1", userId: "user-1" })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("delegates list and mark-read to the notification application facade", async () => {
    const listNotifications = mock(async () => ({
      data: [{
        id: "notification-1",
        orgId: "org-1",
        userId: "user-1",
        kind: "mention",
        title: "Mention",
        read: false,
        createdAt: "2026-05-14T00:00:00.000Z",
      }],
    }));
    const markRead = mock(async () => ({ ok: true }));
    const unreadCount = mock(async () => ({ count: 1 }));
    const markAllRead = mock(async () => ({ count: 1 }));
    const getSettings = mock(async () => ({
      channels: [{ name: "in-app", enabled: true, configurable: false }],
      rules: [{ id: "rule-1", name: "Review", enabled: true, channels: ["in-app"] }],
      quietHours: null,
      mutes: [],
    }));
    const configureChannel = mock(async () => ({ ok: true as const }));
    const testChannel = mock(async () => ({ id: "test-1", channel: "webhook", status: "pending" as const }));
    const listRules = mock(async () => [{ id: "rule-1", name: "Review" }]);
    const getRule = mock(async () => ({ id: "rule-1", name: "Review" }));
    const createRule = mock(async () => ({ id: "rule-2", name: "Created" }));
    const updateRule = mock(async () => ({ id: "rule-1", name: "Updated" }));
    const deleteRule = mock(async () => ({ ok: true as const }));
    const getQuietHours = mock(async () => null);
    const setQuietHours = mock(async () => ({ id: "quiet-1", tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1] }));
    const listMutes = mock(async () => [{ id: "mute-1", subjectKind: "task", subjectId: "task-1" }]);
    const mute = mock(async () => ({ id: "mute-2", subjectKind: "task", subjectId: "task-2", mutedUntil: null }));
    const unmute = mock(async () => ({ ok: true as const }));
    const controller = new NotificationPublicApiController(
      new NotificationPublicApiService({
        featuresEnv: "public-api",
        application: {
          listNotifications,
          markRead,
          unreadCount,
          markAllRead,
          getSettings,
          configureChannel,
          testChannel,
          listRules,
          getRule,
          createRule,
          updateRule,
          deleteRule,
          getQuietHours,
          setQuietHours,
          listMutes,
          mute,
          unmute,
        },
      }),
    );

    await expect(controller.listNotifications({ orgId: "org-1", userId: "user-1" })).resolves.toEqual({
      data: [expect.objectContaining({ id: "notification-1", read: false })],
    });
    await expect(controller.markRead({ id: "notification-1" }, { orgId: "org-1", userId: "user-1" })).resolves.toBeUndefined();
    await expect(controller.unreadCount({ orgId: "org-1", userId: "user-1" })).resolves.toEqual({ count: 1 });
    await expect(controller.markAllRead({ orgId: "org-1", userId: "user-1" })).resolves.toEqual({ count: 1 });
    await expect(controller.getSettings({ orgId: "org-1", userId: "user-1" })).resolves.toEqual({
      channels: [expect.objectContaining({ name: "in-app" })],
      rules: [expect.objectContaining({ id: "rule-1" })],
      quietHours: null,
      mutes: [],
    });
    await expect(
      controller.configureChannel(
        { channel: "webhook" },
        { orgId: "org-1", userId: "user-1" },
        { url: "https://example.test/webhook", secret: "secret" },
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      controller.testChannel({ channel: "webhook" }, { orgId: "org-1", userId: "user-1" }),
    ).resolves.toEqual({ id: "test-1", channel: "webhook", status: "pending" });
    await expect(controller.listRules({ orgId: "org-1", userId: "user-1" })).resolves.toEqual([
      { id: "rule-1", name: "Review" },
    ]);
    await expect(controller.getRule({ id: "rule-1" }, { orgId: "org-1", userId: "user-1" })).resolves.toEqual({
      id: "rule-1",
      name: "Review",
    });
    await expect(controller.createRule(
      { orgId: "org-1", userId: "user-1" },
      { name: "Created", eventPattern: {}, channels: ["in-app"], enabled: true },
    )).resolves.toEqual({ id: "rule-2", name: "Created" });
    await expect(controller.updateRule(
      { id: "rule-1" },
      { orgId: "org-1", userId: "user-1" },
      { name: "Updated" },
    )).resolves.toEqual({ id: "rule-1", name: "Updated" });
    await expect(controller.deleteRule({ id: "rule-1" }, { orgId: "org-1", userId: "user-1" })).resolves.toEqual({
      ok: true,
    });
    await expect(controller.getQuietHours({ orgId: "org-1", userId: "user-1" })).resolves.toBeNull();
    await expect(controller.setQuietHours(
      { orgId: "org-1", userId: "user-1" },
      { tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1] },
    )).resolves.toMatchObject({ id: "quiet-1", tz: "UTC" });
    await expect(controller.listMutes({ orgId: "org-1", userId: "user-1" })).resolves.toEqual([
      { id: "mute-1", subjectKind: "task", subjectId: "task-1" },
    ]);
    await expect(controller.mute(
      { orgId: "org-1", userId: "user-1" },
      { subjectKind: "task", subjectId: "task-2", mutedUntil: null },
    )).resolves.toEqual({ id: "mute-2", subjectKind: "task", subjectId: "task-2", mutedUntil: null });
    await expect(controller.unmute(
      { subjectKind: "task", subjectId: "task-2" },
      { orgId: "org-1", userId: "user-1" },
    )).resolves.toEqual({ ok: true });
    expect(listNotifications).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      unread: undefined,
      limit: undefined,
      offset: undefined,
    });
    expect(markRead).toHaveBeenCalledWith({ id: "notification-1", orgId: "org-1", userId: "user-1" });
    expect(unreadCount).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" });
    expect(markAllRead).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" });
    expect(getSettings).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" });
    expect(configureChannel).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      channel: "webhook",
      enabled: undefined,
      email: undefined,
      token: undefined,
      url: "https://example.test/webhook",
      secret: "secret",
      subscription: null,
    });
    expect(testChannel).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1", channel: "webhook" });
    expect(listRules).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" });
    expect(getRule).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1", id: "rule-1" });
    expect(createRule).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      name: "Created",
      eventPattern: {},
      channels: ["in-app"],
      enabled: true,
    });
    expect(updateRule).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1", id: "rule-1", name: "Updated" });
    expect(deleteRule).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1", id: "rule-1" });
    expect(getQuietHours).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" });
    expect(setQuietHours).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      tz: "UTC",
      startHour: 22,
      endHour: 7,
      daysOfWeek: [1],
    });
    expect(listMutes).toHaveBeenCalledWith({ orgId: "org-1", userId: "user-1" });
    expect(mute).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      subjectKind: "task",
      subjectId: "task-2",
      mutedUntil: null,
    });
    expect(unmute).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      subjectKind: "task",
      subjectId: "task-2",
    });
  });

  test("returns a Nest 404 when mark-read cannot find the notification", async () => {
    const controller = new NotificationPublicApiController(
      new NotificationPublicApiService({
        featuresEnv: "public-api",
        application: {
          listNotifications: async () => ({ data: [] }),
          markRead: async () => null,
          unreadCount: async () => ({ count: 0 }),
          markAllRead: async () => ({ count: 0 }),
        },
      }),
    );

    await expect(
      controller.markRead({ id: "missing" }, { orgId: "org-1", userId: "user-1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test("keeps request validation at the Nest boundary", () => {
    const query = Object.assign(new NotificationListQueryDto(), { orgId: "org-1", userId: "user-1" });
    const invalidQuery = Object.assign(new NotificationListQueryDto(), { orgId: "", userId: "" });
    const params = Object.assign(new NotificationMarkReadParamsDto(), { id: "notification-1" });
    const invalidParams = Object.assign(new NotificationMarkReadParamsDto(), { id: "" });
    const channelParams = Object.assign(new NotificationChannelParamsDto(), { channel: "webhook" });
    const invalidChannelParams = Object.assign(new NotificationChannelParamsDto(), { channel: "fax" });
    const channelBody = Object.assign(new NotificationChannelConfigBodyDto(), {
      url: "https://example.test",
      secret: "secret",
    });
    const ruleParams = Object.assign(new NotificationRuleParamsDto(), { id: "rule-1" });
    const createRule = Object.assign(new NotificationRuleCreateBodyDto(), {
      name: "Review",
      eventPattern: {},
      channels: ["in-app"],
      enabled: true,
      deliveryMode: "immediate",
    });
    const patchRule = Object.assign(new NotificationRulePatchBodyDto(), {
      channels: ["email"],
      digestWindowSeconds: 300,
    });
    const quietHours = Object.assign(new NotificationQuietHoursSetBodyDto(), {
      tz: "UTC",
      startHour: 22,
      endHour: 7,
      daysOfWeek: [1, 2],
    });
    const muteParams = Object.assign(new NotificationMuteParamsDto(), { subjectKind: "task", subjectId: "task-1" });
    const muteBody = Object.assign(new NotificationMuteBodyDto(), {
      subjectKind: "task",
      subjectId: "task-1",
      mutedUntil: "2026-05-14T00:00:00.000Z",
    });

    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(invalidQuery).map((error) => error.property)).toEqual(["orgId", "userId"]);
    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(invalidParams).map((error) => error.property)).toEqual(["id"]);
    expect(validateSync(channelParams)).toHaveLength(0);
    expect(validateSync(invalidChannelParams).map((error) => error.property)).toEqual(["channel"]);
    expect(validateSync(channelBody)).toHaveLength(0);
    expect(validateSync(ruleParams)).toHaveLength(0);
    expect(validateSync(createRule)).toHaveLength(0);
    expect(validateSync(patchRule)).toHaveLength(0);
    expect(validateSync(quietHours)).toHaveLength(0);
    expect(validateSync(muteParams)).toHaveLength(0);
    expect(validateSync(muteBody)).toHaveLength(0);
  });
});
