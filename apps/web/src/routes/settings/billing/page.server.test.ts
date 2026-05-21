import { describe, test, expect, afterEach } from "bun:test";

// Tests for saas-auth gate on billing settings page.

describe("/settings/billing: _isSaasAuthEnabled() and load()", () => {
  const orig = process.env["FULCRUM_FEATURES"];
  const origFlag = process.env["FULCRUM_FLAG_SAAS_AUTH"];

  afterEach(() => {
    if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = orig;

    if (origFlag === undefined) delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    else process.env["FULCRUM_FLAG_SAAS_AUTH"] = origFlag;
  });

  test("_isSaasAuthEnabled OFF by default", async () => {
    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod._isSaasAuthEnabled()).toBe(false);
  });

  test("_isSaasAuthEnabled ON when FULCRUM_FEATURES=saas-auth", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth";
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod._isSaasAuthEnabled()).toBe(true);
  });

  test("load throws 404 when saas-auth OFF (with session)", async () => {
    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let status: number | undefined;
    try {
      await mod.load({
        locals: { session: { userId: "u1" } },
        url: new URL("http://localhost/settings/billing"),
      });
    } catch (e: unknown) {
      const err = e as { status?: number };
      status = err.status;
    }
    expect(status).toBe(404);
  });

  test("load returns billingEnabled when saas-auth ON (with session)", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth";
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let result: unknown;
    try {
      result = await mod.load({
        locals: { session: { userId: "u1" } },
        url: new URL("http://localhost/settings/billing"),
      });
    } catch {
      // ignore redirect
    }
    expect((result as { billingEnabled: boolean }).billingEnabled).toBe(true);
  });

  test("load redirects to login when no session", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth";
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let location: string | undefined;
    try {
      await mod.load({
        locals: { session: null },
        url: new URL("http://localhost/settings/billing"),
      });
    } catch (e: unknown) {
      const err = e as { location?: string; status?: number };
      location = err.location;
    }
    expect(location).toBe("/auth/login");
  });
});
