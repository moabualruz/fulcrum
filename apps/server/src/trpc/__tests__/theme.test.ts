import { describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";

import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import {
  ThemeSettingsRepository,
  THEME_DEFAULTS,
  type ThemeKey,
} from "@fulcrum/server/trpc/routers/theme.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

class MemoryThemeSettingsRepository extends ThemeSettingsRepository {
  private readonly values = new Map<string, string>();

  async listThemeSettings(orgId: string, userId: string) {
    return [...this.values.entries()]
      .filter(([scope]) => scope.startsWith(`${orgId}:${userId}:`))
      .map(([scope, value]) => ({
        key: scope.split(":").at(-1) ?? "",
        value,
      }));
  }

  async upsertThemeSetting(orgId: string, userId: string, key: string, value: string) {
    this.values.set(`${orgId}:${userId}:${key}`, value);
  }
}

function session() {
  return {
    id: "sess-theme",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-theme",
    ipAddress: null,
    userAgent: null,
  };
}

function caller(repo = new MemoryThemeSettingsRepository()) {
  const container = null;
  container.bind({ provide: ThemeSettingsRepository, useValue: repo });
  return t.createCallerFactory(appRouter)(
    createContext({
      session: session() as unknown as import("better-auth").Session,
      orgId: ORG_ID,
      userId: USER_ID,
      em: null,
      container,
    }),
  );
}

describe("theme tRPC router", () => {
  test("listThemes returns default theme values", async () => {
    const result = await caller().theme.listThemes();
    expect(result).toEqual(
      (Object.entries(THEME_DEFAULTS) as Array<[ThemeKey, string]>).map(([key, value]) => ({
        key,
        value,
        defaultValue: value,
      })),
    );
  });

  test("setTheme persists override and getTheme returns it", async () => {
    const c = caller();
    await c.theme.setTheme({ key: "theme.accent", value: "#6D28D9" });

    expect(await c.theme.getTheme({ key: "accent" })).toEqual({
      key: "theme.accent",
      value: "#6D28D9",
      defaultValue: THEME_DEFAULTS["theme.accent"],
    });
    expect(await c.theme.listThemes()).toContainEqual({
      key: "theme.accent",
      value: "#6D28D9",
      defaultValue: THEME_DEFAULTS["theme.accent"],
    });
  });

  test("setTheme rejects invalid accent hex", async () => {
    let error: TRPCError | null = null;
    try {
      await caller().theme.setTheme({ key: "accent", value: "purple" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error?.code).toBe("BAD_REQUEST");
  });

  test("legacy web get/update procedures persist theme settings", async () => {
    const c = caller();

    await c.theme.update({
      accentHue: 217,
      accentSaturation: 91,
      accentLightness: 60,
      radius: 0.75,
      fontFamily: "system",
      colorScheme: "dark",
      compactMode: true,
      animationSpeed: "reduced",
      preset: "ocean",
    });

    expect(await c.theme.get()).toMatchObject({
      accentHue: 217,
      accentSaturation: 91,
      accentLightness: 60,
      radius: 0.75,
      fontFamily: "system",
      colorScheme: "dark",
      compactMode: true,
      animationSpeed: "reduced",
      preset: "ocean",
    });
  });
});
