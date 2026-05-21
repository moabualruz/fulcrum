import { describe, test, expect, afterEach } from "bun:test";

// Tests for the public-api gate on the settings/api page. `isPublicApiEnabled`
// was extracted to `@fulcrum/server/api/feature-flags.ts`; the route imports
// it from there rather than re-exporting it, so the test imports it directly.

describe("/settings/api — isPublicApiEnabled() and load()", () => {
  const orig = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = orig;
  });

  test("isPublicApiEnabled OFF by default", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const { isPublicApiEnabled } = await import(`@fulcrum/server/api/feature-flags.ts?t=${Date.now()}`);
    expect(isPublicApiEnabled()).toBe(false);
  });

  test("isPublicApiEnabled ON when FULCRUM_FEATURES=public-api", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const { isPublicApiEnabled } = await import(`@fulcrum/server/api/feature-flags.ts?t=${Date.now()}`);
    expect(isPublicApiEnabled()).toBe(true);
  });

  test("isPublicApiEnabled ON when mixed with other flags", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth,public-api,notify-webhook";
    const { isPublicApiEnabled } = await import(`@fulcrum/server/api/feature-flags.ts?t=${Date.now()}`);
    expect(isPublicApiEnabled()).toBe(true);
  });

  test("load throws 404 when public-api OFF (with session)", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let status: number | undefined;
    try {
      await mod.load({
        locals: { session: { userId: "u1" } },
        url: new URL("http://localhost/settings/api"),
      });
    } catch (e: unknown) {
      const err = e as { status?: number };
      status = err.status;
    }
    expect(status).toBe(404);
  });

  test("load returns baseUrl when public-api ON", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let result: unknown;
    try {
      result = await mod.load({
        locals: { session: { userId: "u1" } },
        url: new URL("http://localhost/settings/api"),
      });
    } catch {
      // noop
    }
    expect((result as { baseUrl: string }).baseUrl).toBe("http://localhost/api/v1");
  });

  test("load redirects to login when no session", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let location: string | undefined;
    try {
      await mod.load({
        locals: { session: null },
        url: new URL("http://localhost/settings/api"),
      });
    } catch (e: unknown) {
      const err = e as { location?: string };
      location = err.location;
    }
    expect(location).toBe("/auth/login");
  });
});
