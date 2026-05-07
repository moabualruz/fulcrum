import { describe, test, expect, afterEach } from "bun:test";

// Tests for gated connectors settings page.

describe("/settings/connectors", () => {
  const orig = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = orig;
  });

  describe("isConnectorEnabled()", () => {
    test("OFF by default for all connectors", async () => {
      delete process.env["FULCRUM_FEATURES"];
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod._isConnectorEnabled("confluence")).toBe(false);
      expect(mod._isConnectorEnabled("notion")).toBe(false);
      expect(mod._isConnectorEnabled("github-issues")).toBe(false);
    });

    test("ON when connector flag present", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-confluence";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod._isConnectorEnabled("confluence")).toBe(true);
      expect(mod._isConnectorEnabled("notion")).toBe(false);
    });

    test("mixed flags enable only named connectors", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-notion,connector-github-issues";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod._isConnectorEnabled("notion")).toBe(true);
      expect(mod._isConnectorEnabled("github-issues")).toBe(true);
      expect(mod._isConnectorEnabled("confluence")).toBe(false);
    });
  });

  describe("load()", () => {
    test("redirects when no session", async () => {
      delete process.env["FULCRUM_FEATURES"];
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      let thrown: unknown;
      try {
        await mod.load({ locals: {} });
      } catch (e) {
        thrown = e;
      }
      const err = thrown as { status?: number; location?: string };
      expect(err.status).toBe(302);
    });

    test("returns connectors array with enabled=false when no flags", async () => {
      delete process.env["FULCRUM_FEATURES"];
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const result = await mod.load({ locals: { session: { userId: "u1" } } }) as {
        connectors: { name: string; enabled: boolean }[];
        syncLog: unknown[];
      };
      expect(result.connectors.length).toBe(3);
      expect(result.connectors.every((c: { enabled: boolean }) => !c.enabled)).toBe(true);
      expect(Array.isArray(result.syncLog)).toBe(true);
    });

    test("returns enabled=true for flagged connector", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-notion";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const result = await mod.load({ locals: { session: { userId: "u1" } } }) as {
        connectors: { name: string; enabled: boolean }[];
      };
      const notion = result.connectors.find((c: { name: string }) => c.name === "notion");
      expect(notion?.enabled).toBe(true);
    });
  });

  describe("listSyncLog()", () => {
    test("returns application-owned empty log when no global connector runtime exists", async () => {
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod._listSyncLog()).toEqual([]);
    });
  });

  describe("actions.sync()", () => {
    test("returns 501 when global connector runtime is not configured", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-github-issues";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("name", "github-issues");
      const result = await mod.actions.sync({ locals: { session: { userId: "u1" } }, request: { formData: async () => formData } }) as { status?: number };
      expect(result.status).toBe(501);
    });

    test("throws 403 when connector not enabled", async () => {
      delete process.env["FULCRUM_FEATURES"];
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("name", "confluence");
      let thrown: unknown;
      try {
        await mod.actions.sync({ locals: { session: { userId: "u1" } }, request: { formData: async () => formData } });
      } catch (e) {
        thrown = e;
      }
      const err = thrown as { status?: number };
      expect(err?.status).toBe(403);
    });
  });

  describe("actions.save()", () => {
    test("returns 501 when global connector persistence is not configured", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-confluence";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("name", "confluence");
      formData.append("host", "https://acme.atlassian.net");
      formData.append("email", "a@b.com");
      formData.append("token", "tok");

      const result = await mod.actions.save({ locals: { session: { userId: "u1" } }, request: { formData: async () => formData } }) as { status?: number };

      expect(result.status).toBe(501);
    });

    test("fails 400 when host or token is missing", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-confluence";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("name", "confluence");
      formData.append("token", "tok");

      const missingHost = await mod.actions.save({ locals: { session: { userId: "u1" } }, request: { formData: async () => formData } }) as { status?: number };
      expect(missingHost.status).toBe(400);

      const tokenless = new FormData();
      tokenless.append("name", "confluence");
      tokenless.append("host", "https://acme.atlassian.net");
      const missingToken = await mod.actions.save({ locals: { session: { userId: "u1" } }, request: { formData: async () => tokenless } }) as { status?: number };
      expect(missingToken.status).toBe(400);
    });

    test("throws 403 when connector is disabled", async () => {
      delete process.env["FULCRUM_FEATURES"];
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("name", "confluence");
      formData.append("host", "https://acme.atlassian.net");
      formData.append("token", "tok");
      let thrown: unknown;

      try {
        await mod.actions.save({ locals: { session: { userId: "u1" } }, request: { formData: async () => formData } });
      } catch (error) {
        thrown = error;
      }

      expect((thrown as { status?: number })?.status).toBe(403);
    });

    test("fails 400 when scalar fields are uploaded as files", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-confluence";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("name", "confluence");
      formData.append("host", new File(["https://acme.atlassian.net"], "host.txt"));
      formData.append("token", "tok");

      const result = await mod.actions.save({ locals: { session: { userId: "u1" } }, request: { formData: async () => formData } }) as { status?: number };

      expect(result.status).toBe(400);
    });
  });
});
