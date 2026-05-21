import type { Component } from "svelte";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "bun:test";

/**
 * `/artifacts` is re-homed to the Ship stage workbench (`/ship`) per
 * `IA-MAP.md §2.5` and `design-alignment/ship.md`. The route's `+page.svelte`
 * is now a re-home stub: `+page.server.ts` 301-redirects every GET to `/ship`,
 * and this markup is the no-JS deprecation notice.
 *
 * No feature loss: the destructive bulk archive/delete controls move to the
 * Ship workbench: this suite asserts the stub points at `/ship` and that the
 * Ship route carries the release-management surface forward.
 */
describe("/artifacts +page.svelte: re-home stub", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component };
    Page = mod.default;
  });

  test("renders the re-home notice pointing at the Ship workbench", () => {
    const { body } = render(Page);
    expect(body).toContain("data-artifacts-rehomed");
    expect(body).toContain("Artifacts moved to Ship");
    expect(body).toContain("data-artifacts-ship-link");
    expect(body).toContain('href="/ship"');
  });

  test("the Ship workbench carries the release surface forward", () => {
    const ship = readFileSync(new URL("../ship/+page.svelte", import.meta.url), "utf8");
    expect(ship).toContain("data-ship-toolbar");
    expect(ship).toContain("data-ship-release-table");
    expect(ship).toContain("data-ship-cut-release");
    expect(ship).toContain("data-ship-peek");
  });

  test("the server route preserves the upload + bulk archive/delete actions", () => {
    const server = readFileSync(new URL("./+page.server.ts", import.meta.url), "utf8");
    expect(server).toContain("upload:");
    expect(server).toContain("bulk:");
    expect(server).toContain("api.archive");
    expect(server).toContain("api.delete");
    // The list view is a 301 redirect to the canonical Ship route.
    expect(server).toContain("redirect(301");
    expect(server).toContain("/ship");
  });
});
