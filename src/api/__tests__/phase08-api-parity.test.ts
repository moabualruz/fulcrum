import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createPublicApi, createPublicApiRouter } from "../hono.ts";
import { listMissingApiDomains } from "../../surfaces/parity.ts";

const API_ROUTE_MODULES = {
  tasks: "kernel-tasks.ts",
  sprints: "kernel-sprints.ts",
  docs: "docs.ts",
  memory: "memory.ts",
  runs: "runs.ts",
  repos: "repos.ts",
  artifacts: "artifacts.ts",
  search: "search.ts",
  notifications: "kernel-notifications.ts",
} as const;

describe("Phase 08 REST API parity inventory", () => {
  test("createPublicApi registers required public route groups", async () => {
    const source = await readFile(new URL("../hono.ts", import.meta.url), "utf-8");
    const registered = Object.keys(API_ROUTE_MODULES).filter((domain) => {
      const routeName = domain === "notifications" ? "KernelNotification" : domain[0]!.toUpperCase() + domain.slice(1, -Number(domain.endsWith("s")));
      return source.toLowerCase().includes(`register${routeName.toLowerCase()}`);
    });

    expect(listMissingApiDomains(registered)).toEqual([]);
  });

  test("serves OpenAPI through /api/v1/openapi.json and compatibility /api/openapi.json", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const api = createPublicApiRouter();

    const v1 = await api.request("/api/v1/openapi.json");
    const compat = await api.request("/api/openapi.json");

    expect(v1.status).toBe(200);
    expect(compat.status).toBe(200);
    expect((await v1.json()).openapi).toBe("3.1.0");
    expect((await compat.json()).openapi).toBe("3.1.0");
  });

  test("Phase 5-7 route modules are service-backed, not in-memory stubs", async () => {
    const routesRoot = new URL("../routes/", import.meta.url).pathname;
    const stubbed: string[] = [];

    for (const [domain, file] of Object.entries(API_ROUTE_MODULES)) {
      const source = await readFile(join(routesRoot, file), "utf-8");
      if (
        source.includes("Stub store") ||
        source.includes("In-memory stub store") ||
        source.includes("makeStubStore") ||
        source.includes("STUB_")
      ) {
        stubbed.push(domain);
      }
    }

    expect(stubbed).toEqual([]);
  });

  test("public API OpenAPI spec includes docs, search, and artifacts paths", () => {
    const api = createPublicApi();
    const spec = api.getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "Fulcrum Public API", version: "1" },
    });
    const paths = Object.keys(spec.paths ?? {});

    expect(paths).toContain("/docs");
    expect(paths).toContain("/search");
    expect(paths).toContain("/artifacts");
  });
});
