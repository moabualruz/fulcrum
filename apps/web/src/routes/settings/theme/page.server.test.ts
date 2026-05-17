import { describe, expect, test } from "bun:test";
import { THEME_DEFAULTS, PRESETS } from "./theme";

const forbiddenTransportPath = "/api/" + "tr" + "pc";

describe("/settings/theme +page.server.ts constants", () => {
  test("THEME_DEFAULTS has all required keys", () => {
    expect(typeof THEME_DEFAULTS.accentHue).toBe("number");
    expect(typeof THEME_DEFAULTS.accentSaturation).toBe("number");
    expect(typeof THEME_DEFAULTS.accentLightness).toBe("number");
    expect(typeof THEME_DEFAULTS.radius).toBe("number");
    expect(typeof THEME_DEFAULTS.fontFamily).toBe("string");
    expect(typeof THEME_DEFAULTS.colorScheme).toBe("string");
    expect(typeof THEME_DEFAULTS.compactMode).toBe("boolean");
    expect(typeof THEME_DEFAULTS.animationSpeed).toBe("string");
    expect(typeof THEME_DEFAULTS.preset).toBe("string");
  });

  test("THEME_DEFAULTS accent values in valid range", () => {
    expect(THEME_DEFAULTS.accentHue).toBeGreaterThanOrEqual(0);
    expect(THEME_DEFAULTS.accentHue).toBeLessThanOrEqual(360);
    expect(THEME_DEFAULTS.accentSaturation).toBeGreaterThanOrEqual(0);
    expect(THEME_DEFAULTS.accentSaturation).toBeLessThanOrEqual(100);
    expect(THEME_DEFAULTS.accentLightness).toBeGreaterThanOrEqual(0);
    expect(THEME_DEFAULTS.accentLightness).toBeLessThanOrEqual(100);
  });

  test("THEME_DEFAULTS radius in valid range", () => {
    expect(THEME_DEFAULTS.radius).toBeGreaterThanOrEqual(0);
    expect(THEME_DEFAULTS.radius).toBeLessThanOrEqual(1.5);
  });

  test("THEME_DEFAULTS compact mode is false", () => {
    expect(THEME_DEFAULTS.compactMode).toBe(false);
  });

  test("THEME_DEFAULTS color scheme is auto", () => {
    expect(THEME_DEFAULTS.colorScheme).toBe("auto");
  });

  test("THEME_DEFAULTS preset is default", () => {
    expect(THEME_DEFAULTS.preset).toBe("default");
  });

  test("PRESETS has 5 entries", () => {
    expect(Object.keys(PRESETS)).toHaveLength(5);
  });

  test("PRESETS entries cover all named presets", () => {
    for (const name of ["default", "ocean", "forest", "sunset", "monochrome"]) {
      expect(PRESETS).toHaveProperty(name);
    }
  });

  test("each preset has numeric accentHue", () => {
    for (const [, preset] of Object.entries(PRESETS)) {
      if (preset.accentHue !== undefined) {
        expect(typeof preset.accentHue).toBe("number");
      }
    }
  });

  test("monochrome preset has zero saturation", () => {
    expect(PRESETS.monochrome.accentSaturation).toBe(0);
  });
});

describe("/settings/theme load() fallback", () => {
  test("load redirects anonymous users", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let threw = false;
    try {
      await mod.load({
        locals: { session: null },
        fetch: async () => { throw new Error("no server"); },
        request: { headers: { get: () => null } },
        url: new URL("http://localhost/settings/theme"),
      });
    } catch (e) {
      threw = true;
      const err = e as { status?: number; location?: string };
      expect(err.status).toBe(302);
    }
    expect(threw).toBe(true);
  });

  test("load returns defaults when no scoped API caller is configured", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { session: { userId: "u1" } },
      fetch: async () => {
        throw new Error("unexpected API call");
      },
      request: { headers: { get: () => null } },
      url: new URL("http://localhost/settings/theme"),
    });
    expect(result.settings).toEqual(THEME_DEFAULTS);
  });

  test("load merges Nest public API settings onto defaults", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 2}`);
    const remote = { accentHue: 30, preset: "sunset" };
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await mod.load({
      locals: { session: { userId: "u1" }, orgId: "org-1", userId: "user-1" },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });
        return Response.json(remote);
      },
      request: { headers: { get: () => "sid=session-1" } },
      url: new URL("http://localhost/settings/theme"),
    });
    expect(result.settings.accentHue).toBe(30);
    expect(result.settings.preset).toBe("sunset");
    expect(result.settings.compactMode).toBe(THEME_DEFAULTS.compactMode);
    expect(calls).toEqual([
      {
        url: "http://localhost/api/v1/settings/theme?orgId=org-1&userId=user-1",
        init: {
          method: "GET",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            cookie: "sid=session-1",
          },
          body: undefined,
        },
      },
    ]);
  });
});

describe("/settings/theme actions", () => {
  test("save sends settings through the Nest public API", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 3}`);
    const form = new FormData();
    form.set("accentHue", "42");
    form.set("accentSaturation", "70");
    form.set("accentLightness", "46");
    form.set("radius", "0.75");
    form.set("fontFamily", "mono");
    form.set("colorScheme", "dark");
    form.set("compactMode", "true");
    form.set("animationSpeed", "reduced");
    form.set("preset", "ocean");
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await mod.actions.save({
      locals: { session: { userId: "u1" }, orgId: "org-1", userId: "user-1" },
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes(forbiddenTransportPath)) throw new Error("unexpected transport call");
        calls.push({ url: target, init: init ?? {} });
        return Response.json({ ok: true });
      },
      request: {
        headers: { get: () => "sid=session-1" },
        formData: async () => form,
      },
      url: new URL("http://localhost/settings/theme"),
    });

    expect(result).toMatchObject({
      saved: true,
      settings: {
        accentHue: 42,
        fontFamily: "mono",
        colorScheme: "dark",
        compactMode: true,
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost/api/v1/settings/theme");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(calls[0]?.init.headers).toEqual({
      "content-type": "application/json",
      cookie: "sid=session-1",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      accentHue: 42,
      compactMode: true,
      preset: "ocean",
    });
  });

  test("save fails without a scoped API caller", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 4}`);
    const result = await mod.actions.save({
      locals: { session: { userId: "u1" } },
      fetch: async () => {
        throw new Error("unexpected API call");
      },
      request: {
        headers: { get: () => null },
        formData: async () => new FormData(),
      },
      url: new URL("http://localhost/settings/theme"),
    });

    expect(result).toMatchObject({
      status: 503,
      data: {
        saveError: "Theme settings API caller is not configured.",
      },
    });
  });
});
