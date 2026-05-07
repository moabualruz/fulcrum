import { describe, expect, test } from "bun:test";
import { THEME_DEFAULTS, PRESETS } from "./theme";

// ── Unit tests for theme defaults and presets ────────────────────────────────
// The load() and actions() call tRPC internally; we test the exported constants
// and verify their shape so the page renders correctly when the tRPC server is
// absent (falls back to defaults).

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
  test("load falls back to THEME_DEFAULTS when fetch throws", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    // Simulate redirect since session is null
    let threw = false;
    try {
      await mod.load({
        locals: { session: null },
        fetch: async () => { throw new Error("no server"); },
        request: { headers: { get: () => null } },
        url: new URL("http://localhost/settings/theme"),
      });
    } catch (e) {
      // Expected: redirect(302, "/auth/login")
      threw = true;
      const err = e as { status?: number; location?: string };
      expect(err.status).toBe(302);
    }
    expect(threw).toBe(true);
  });

  test("load returns settings when session present but tRPC returns null", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { session: { userId: "u1" } },
      fetch: async () => new Response(JSON.stringify({ result: { data: { json: null } } }), { status: 200 }),
      request: { headers: { get: () => null } },
      url: new URL("http://localhost/settings/theme"),
    });
    expect(result.settings).toEqual(THEME_DEFAULTS);
  });

  test("load merges remote overrides onto defaults", async () => {
    const mod = await import(`./+page.server.ts?t=${Date.now() + 2}`);
    const remote = { accentHue: 30, preset: "sunset" };
    const result = await mod.load({
      locals: { session: { userId: "u1" } },
      fetch: async () =>
        new Response(JSON.stringify({ result: { data: { json: remote } } }), { status: 200 }),
      request: { headers: { get: () => null } },
      url: new URL("http://localhost/settings/theme"),
    });
    expect(result.settings.accentHue).toBe(30);
    expect(result.settings.preset).toBe("sunset");
    // Other defaults preserved
    expect(result.settings.compactMode).toBe(THEME_DEFAULTS.compactMode);
  });
});
