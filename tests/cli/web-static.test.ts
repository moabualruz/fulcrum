import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

import { resolveClientAssetPath } from "../../src/cli/index.ts";

describe("resolveClientAssetPath", () => {
  const clientRoot = resolve("/tmp/fulcrum-web-client");

  test("resolves ordinary client assets under client root", () => {
    expect(resolveClientAssetPath(clientRoot, "/_app/immutable/app.js")).toBe(
      join(clientRoot, "_app", "immutable", "app.js"),
    );
  });

  test("rejects percent-decoded traversal outside client root", () => {
    expect(resolveClientAssetPath(clientRoot, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
  });

  test("rejects malformed URI and NUL byte paths", () => {
    expect(resolveClientAssetPath(clientRoot, "/%E0%A4%A")).toBeNull();
    expect(resolveClientAssetPath(clientRoot, "/static%00.js")).toBeNull();
  });
});
