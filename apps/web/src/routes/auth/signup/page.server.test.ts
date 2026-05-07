import { describe, test, expect, afterEach } from "bun:test";

// Tests for saas-auth gate on signup page.

describe("/auth/signup — isSaasAuthEnabled() and load()", () => {
  const orig = process.env["FULCRUM_FEATURES"];
  const origFlag = process.env["FULCRUM_FLAG_SAAS_AUTH"];

  afterEach(() => {
    if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = orig;

    if (origFlag === undefined) delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    else process.env["FULCRUM_FLAG_SAAS_AUTH"] = origFlag;
  });

  test("isSaasAuthEnabled OFF by default", async () => {
    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod.isSaasAuthEnabled()).toBe(false);
  });

  test("isSaasAuthEnabled ON with FULCRUM_FEATURES=saas-auth", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth";
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    expect(mod.isSaasAuthEnabled()).toBe(true);
  });

  test("load throws 404 when saas-auth OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let status: number | undefined;
    try {
      await mod.load({ locals: { session: null } });
    } catch (e: unknown) {
      const err = e as { status?: number };
      status = err.status;
    }
    expect(status).toBe(404);
  });

  test("load succeeds when saas-auth ON", async () => {
    process.env["FULCRUM_FEATURES"] = "saas-auth";
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const mod = await import(`./+page.server.ts?t=${Date.now()}`);
    let threw = false;
    try {
      await mod.load({ locals: { session: null } });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
