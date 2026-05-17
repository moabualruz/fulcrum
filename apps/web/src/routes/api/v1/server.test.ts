import { describe, test, expect, afterEach } from "bun:test";

// Tests for public-api gate on /api/v1 route and OpenAPI spec.

describe("/api/v1 — isPublicApiEnabled() and buildOpenApiSpec()", () => {
  const orig = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = orig;
  });

  test("isPublicApiEnabled OFF by default", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const mod = await import(`./+server.ts?t=${Date.now()}`);
    expect(mod._isPublicApiEnabled()).toBe(false);
  });

  test("isPublicApiEnabled ON with FULCRUM_FEATURES=public-api", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const mod = await import(`./+server.ts?t=${Date.now()}`);
    expect(mod._isPublicApiEnabled()).toBe(true);
  });

  test("buildOpenApiSpec returns valid OpenAPI 3.1 structure", async () => {
    const mod = await import(`./+server.ts?t=${Date.now()}`);
    const spec = mod._buildOpenApiSpec("http://localhost/api/v1");
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Fulcrum API");
    expect(Array.isArray(spec.servers)).toBe(true);
    expect(spec.servers[0].url).toBe("http://localhost/api/v1");
  });

  test("buildOpenApiSpec has at least 3 domain endpoints (tasks, docs, projects)", async () => {
    const mod = await import(`./+server.ts?t=${Date.now()}`);
    const spec = mod._buildOpenApiSpec("http://localhost/api/v1");
    const paths = Object.keys(spec.paths);
    const hasTasks = paths.some((p) => p.startsWith("/tasks"));
    const hasDocs = paths.some((p) => p.startsWith("/docs"));
    const hasProjects = paths.some((p) => p.startsWith("/projects"));
    expect(hasTasks).toBe(true);
    expect(hasDocs).toBe(true);
    expect(hasProjects).toBe(true);
  });

  test("GET /api/v1 returns 404 JSON when public-api OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const mod = await import(`./+server.ts?t=${Date.now()}`);
    const response = await mod.GET({
      url: new URL("http://localhost/api/v1"),
      request: new Request("http://localhost/api/v1"),
    } as unknown as Parameters<typeof mod.GET>[0]);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test("GET /api/v1 returns 200 when public-api ON", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const mod = await import(`./+server.ts?t=${Date.now()}`);
    const response = await mod.GET({
      url: new URL("http://localhost/api/v1"),
      request: new Request("http://localhost/api/v1"),
    } as unknown as Parameters<typeof mod.GET>[0]);
    expect(response.status).toBe(200);
  });
});
