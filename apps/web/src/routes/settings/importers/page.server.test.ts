import { describe, test, expect, afterEach } from "bun:test";

// Tests for gated importers settings page.

describe("/settings/importers", () => {
  const orig = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = orig;
  });

  describe("isImporterEnabled()", () => {
    test("OFF by default for all importers", async () => {
      delete process.env["FULCRUM_FEATURES"];
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod._isImporterEnabled("csv")).toBe(false);
      expect(mod._isImporterEnabled("linear")).toBe(false);
      expect(mod._isImporterEnabled("jira")).toBe(false);
      expect(mod._isImporterEnabled("plane")).toBe(false);
    });

    test("ON when import-csv flag present", async () => {
      process.env["FULCRUM_FEATURES"] = "import-csv";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod._isImporterEnabled("csv")).toBe(true);
      expect(mod._isImporterEnabled("linear")).toBe(false);
    });

    test("mixed flags enable only named importers", async () => {
      process.env["FULCRUM_FEATURES"] = "import-linear,import-jira";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod._isImporterEnabled("linear")).toBe(true);
      expect(mod._isImporterEnabled("jira")).toBe(true);
      expect(mod._isImporterEnabled("csv")).toBe(false);
      expect(mod._isImporterEnabled("plane")).toBe(false);
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
      const err = thrown as { status?: number };
      expect(err.status).toBe(302);
    });

    test("returns importers array with enabled=false when no flags", async () => {
      delete process.env["FULCRUM_FEATURES"];
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const result = await mod.load({ locals: { session: { userId: "u1" } } }) as {
        importers: { name: string; enabled: boolean }[];
        importHistory: unknown[];
      };
      expect(result.importers.length).toBe(4);
      expect(result.importers.every((i: { enabled: boolean }) => !i.enabled)).toBe(true);
      expect(Array.isArray(result.importHistory)).toBe(true);
    });

    test("enabled=true for flagged importer", async () => {
      process.env["FULCRUM_FEATURES"] = "import-csv";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const result = await mod.load({ locals: { session: { userId: "u1" } } }) as {
        importers: { name: string; enabled: boolean }[];
      };
      const csv = result.importers.find((i: { name: string }) => i.name === "csv");
      expect(csv?.enabled).toBe(true);
    });
  });

  describe("actions.preflight() — CSV", () => {
    test("returns rowCount and columns for valid CSV", async () => {
      process.env["FULCRUM_FEATURES"] = "import-csv";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const csvContent = "title,description,status\nTask 1,Desc 1,todo\nTask 2,Desc 2,done";
      const file = new File([csvContent], "tasks.csv", { type: "text/csv" });
      const formData = new FormData();
      formData.append("importerName", "csv");
      formData.append("file", file);

      const result = await mod.actions.preflight({
        locals: { session: { userId: "u1" } },
        request: { formData: async () => formData },
      }) as { preflightOk?: boolean; rowCount?: number; columns?: string[] };

      expect(result.preflightOk).toBe(true);
      expect(result.rowCount).toBe(2);
      expect(result.columns).toContain("title");
      expect(result.columns).toContain("status");
    });

    test("parses quoted CSV headers without splitting quoted commas", async () => {
      process.env["FULCRUM_FEATURES"] = "import-csv";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const file = new File(["\ufefftitle,\"description, long\",status\nTask 1,\"a,b\",todo"], "tasks.csv", { type: "text/csv" });
      const formData = new FormData();
      formData.append("importerName", "csv");
      formData.append("file", file);

      const result = await mod.actions.preflight({
        locals: { session: { userId: "u1" } },
        request: { formData: async () => formData },
      }) as { preflightOk?: boolean; rowCount?: number; columns?: string[] };

      expect(result.preflightOk).toBe(true);
      expect(result.rowCount).toBe(1);
      expect(result.columns).toEqual(["title", "description, long", "status"]);
    });

    test("fails with 400 when file field is not a File", async () => {
      process.env["FULCRUM_FEATURES"] = "import-csv";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("importerName", "csv");
      formData.append("file", "not-a-file");

      const result = await mod.actions.preflight({
        locals: { session: { userId: "u1" } },
        request: { formData: async () => formData },
      }) as { status?: number };

      expect(result.status).toBe(400);
    });

    test("fails with 400 when no file", async () => {
      process.env["FULCRUM_FEATURES"] = "import-csv";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("importerName", "csv");

      const result = await mod.actions.preflight({
        locals: { session: { userId: "u1" } },
        request: { formData: async () => formData },
      }) as { status?: number };

      expect(result.status).toBe(400);
    });

    test("throws 403 when import-csv not enabled", async () => {
      delete process.env["FULCRUM_FEATURES"];
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("importerName", "csv");
      formData.append("file", new File(["a,b\n1,2"], "f.csv"));

      let thrown: unknown;
      try {
        await mod.actions.preflight({
          locals: { session: { userId: "u1" } },
          request: { formData: async () => formData },
        });
      } catch (e) {
        thrown = e;
      }
      expect((thrown as { status?: number })?.status).toBe(403);
    });
  });

  describe("actions.preflight() — Linear", () => {
    test("returns 501 when importer application service is not configured", async () => {
      process.env["FULCRUM_FEATURES"] = "import-linear";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("importerName", "linear");
      formData.append("apiKey", "lin_api_abc123");

      const result = await mod.actions.preflight({
        locals: { session: { userId: "u1" } },
        request: { formData: async () => formData },
      }) as { status?: number };

      expect(result.status).toBe(501);
    });

    test("fails 400 when no apiKey", async () => {
      process.env["FULCRUM_FEATURES"] = "import-linear";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("importerName", "linear");

      const result = await mod.actions.preflight({
        locals: { session: { userId: "u1" } },
        request: { formData: async () => formData },
      }) as { status?: number };

      expect(result.status).toBe(400);
    });

    test("fails 400 when apiKey is uploaded as a file", async () => {
      process.env["FULCRUM_FEATURES"] = "import-linear";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("importerName", "linear");
      formData.append("apiKey", new File(["lin_api_abc123"], "token.txt"));

      const result = await mod.actions.preflight({
        locals: { session: { userId: "u1" } },
        request: { formData: async () => formData },
      }) as { status?: number };

      expect(result.status).toBe(400);
    });
  });

  describe("actions.import()", () => {
    test("returns 501 instead of route-local fake import success", async () => {
      process.env["FULCRUM_FEATURES"] = "import-jira";
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("importerName", "jira");
      formData.append("rowCount", "25");

      const result = await mod.actions.import({
        locals: { session: { userId: "u1" } },
        request: { formData: async () => formData },
      }) as { status?: number };

      expect(result.status).toBe(501);
    });

    test("throws 403 when import-plane not enabled", async () => {
      delete process.env["FULCRUM_FEATURES"];
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      const formData = new FormData();
      formData.append("importerName", "plane");
      formData.append("rowCount", "5");

      let thrown: unknown;
      try {
        await mod.actions.import({
          locals: { session: { userId: "u1" } },
          request: { formData: async () => formData },
        });
      } catch (e) {
        thrown = e;
      }
      expect((thrown as { status?: number })?.status).toBe(403);
    });
  });

  describe("listImportHistory()", () => {
    test("returns application-owned empty history when no importer persistence exists", async () => {
      const mod = await import(`./+page.server.ts?t=${Date.now()}`);
      expect(mod._listImportHistory()).toEqual([]);
    });
  });
});
