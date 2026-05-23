import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const serverApiDir = join(import.meta.dir, "../../src/lib/server");

describe("web server API client contract", () => {
  test("route-scoped API wrappers forward request fetch and cookies", () => {
    const wrappers = readdirSync(serverApiDir)
      .filter((file) => file.endsWith("-api.ts"))
      .filter((file) => file !== "public-api.ts")
      .map((file) => join(serverApiDir, file));

    expect(wrappers.length).toBeGreaterThan(0);

    for (const wrapper of wrappers) {
      const source = readFileSync(wrapper, "utf8");
      const name = basename(wrapper);

      expect(source, `${name} must use route-scoped fetch`).toContain("fetch: event.fetch");
      expect(source, `${name} must use shared cookie forwarding`).toContain("cookieHeaders");
    }
  });
});
