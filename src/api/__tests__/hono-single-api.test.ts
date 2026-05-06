import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { createPublicApiRouter } from "../hono.ts";

describe("single Hono API surface", () => {
  test("/api/v1/openapi.json is served by the unified Hono app", async () => {
    const previousFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "public-api";
    try {
      const router = createPublicApiRouter();
      const response = await router.request("/api/v1/openapi.json");
      const spec = await response.json();

      expect(response.status).toBe(200);
      expect(spec.openapi).toBe("3.1.0");
      expect(spec.info.title).toBe("Fulcrum Public API");
    } finally {
      if (previousFeatures === undefined) {
        delete process.env["FULCRUM_FEATURES"];
      } else {
        process.env["FULCRUM_FEATURES"] = previousFeatures;
      }
    }
  });

  test("unified API does not mount the deprecated product-kernel router", () => {
    const source = readFileSync("src/api/hono.ts", "utf8");
    expect(source).not.toContain("product-kernel/api/router");
    expect(source).not.toContain("createUnifiedApi");
  });
});
