import { describe, test, expect, beforeEach, afterEach } from "bun:test";

// Tests for saas-auth feature flag gate on login page.

describe("/auth/login — _isSaasAuthEnabled()", () => {
  const orig = process.env["FULCRUM_FEATURES"];
  const origFlag = process.env["FULCRUM_FLAG_SAAS_AUTH"];

  afterEach(() => {
    if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = orig;

    if (origFlag === undefined) delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    else process.env["FULCRUM_FLAG_SAAS_AUTH"] = origFlag;
  });

  test("OFF when FULCRUM_FEATURES unset", async () => {
    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod._isSaasAuthEnabled()).toBe(false);
  });

  test("OFF when FULCRUM_FEATURES is empty", async () => {
    process.env["FULCRUM_FEATURES"] = "";
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod._isSaasAuthEnabled()).toBe(false);
  });

  test("ON when FULCRUM_FEATURES=saas-auth", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth";
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod._isSaasAuthEnabled()).toBe(true);
  });

  test("ON when FULCRUM_FEATURES includes saas-auth among others", async () => {
    process.env["FULCRUM_FEATURES"] = "i18n,saas-auth,public-api";
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod._isSaasAuthEnabled()).toBe(true);
  });

  test("ON when FULCRUM_FLAG_SAAS_AUTH=true (legacy flag)", async () => {
    delete process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FLAG_SAAS_AUTH"] = "true";
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod._isSaasAuthEnabled()).toBe(true);
  });

  test("load returns saasAuthEnabled=false when OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let redirected = false;
    let result: unknown;
    try {
      result = await mod.load({
        locals: { session: null },
        fetch: async () => new Response(),
        request: { headers: { get: () => null } },
        url: new URL("http://localhost/auth/login"),
      });
    } catch (e) {
      redirected = true;
    }
    expect(redirected).toBe(false);
    expect((result as { saasAuthEnabled: boolean }).saasAuthEnabled).toBe(false);
  });

  test("load returns saasAuthEnabled=true when ON", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth";
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let result: unknown;
    try {
      result = await mod.load({
        locals: { session: null },
        fetch: async () => new Response(),
        request: { headers: { get: () => null } },
        url: new URL("http://localhost/auth/login"),
      });
    } catch {
      // redirect if session set — won't happen here
    }
    expect((result as { saasAuthEnabled: boolean }).saasAuthEnabled).toBe(true);
  });
});
