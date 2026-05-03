import { describe, test, expect, beforeEach, afterEach } from "bun:test";

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
      expect(mod.isConnectorEnabled("confluence")).toBe(false);
      expect(mod.isConnectorEnabled("notion")).toBe(false);
      expect(mod.isConnectorEnabled("github-issues")).toBe(false);
    });

    test("ON when connector flag present", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-confluence";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod.isConnectorEnabled("confluence")).toBe(true);
      expect(mod.isConnectorEnabled("notion")).toBe(false);
    });

    test("mixed flags enable only named connectors", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-notion,connector-github-issues";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod.isConnectorEnabled("notion")).toBe(true);
      expect(mod.isConnectorEnabled("github-issues")).toBe(true);
      expect(mod.isConnectorEnabled("confluence")).toBe(false);
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

  describe("setConnectorConfig / getConnectorConfig round-trip", () => {
    test("stores and retrieves config", async () => {
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      mod.setConnectorConfig({ name: "confluence", host: "https://acme.atlassian.net", email: "a@b.com", token: "tok" });
      const cfg = mod.getConnectorConfig("confluence");
      expect(cfg?.host).toBe("https://acme.atlassian.net");
      expect(cfg?.token).toBe("tok");
    });
  });

  describe("addSyncLogEntry / getSyncLog round-trip", () => {
    test("stores sync log entries", async () => {
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const before = mod.getSyncLog().length;
      mod.addSyncLogEntry({
        id: "sl-1",
        connectorName: "notion",
        startedAt: new Date().toISOString(),
        status: "success",
        message: "Synced 42 pages",
      });
      expect(mod.getSyncLog().length).toBe(before + 1);
      const entry = mod.getSyncLog().find((e: { id: string }) => e.id === "sl-1");
      expect(entry?.message).toBe("Synced 42 pages");
    });
  });

  describe("actions.sync()", () => {
    test("adds sync log entry when connector enabled", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-github-issues";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const before = mod.getSyncLog().length;
      const formData = new FormData();
      formData.append("name", "github-issues");
      let result: unknown;
      try {
        result = await mod.actions.sync({ locals: { session: { userId: "u1" } }, request: { formData: async () => formData } });
      } catch {
        // noop
      }
      const r = result as { syncOk?: boolean };
      expect(r?.syncOk).toBe(true);
      expect(mod.getSyncLog().length).toBe(before + 1);
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
});
