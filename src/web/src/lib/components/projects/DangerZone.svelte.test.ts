import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `svelte/server` `render()` needs server-compiled `.svelte` modules; the
// global `[test] preload` plugin (`svelte-ssr-preload.ts`) wires this up.

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

type DangerZoneProps = { projectId: string; projectName: string };

describe("DangerZone component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let DangerZone: Component<DangerZoneProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./DangerZone.svelte")) as {
      default: Component<DangerZoneProps>;
    };
    DangerZone = mod.default;
  });

  test("renders the danger-trigger button and a hidden confirm panel by default", () => {
    const { body } = render(DangerZone, {
      props: { projectId: "01J0PROJECT", projectName: "Demo" },
    });
    expect(body).toContain("data-danger-zone");
    const triggerMatch = body.match(/<button\b[^>]*data-danger-trigger[^>]*>/);
    expect(triggerMatch).not.toBeNull();
    const confirmMatch = body.match(/<div\b[^>]*data-danger-confirm[^>]*>/);
    expect(confirmMatch).not.toBeNull();
    // The confirm panel must be hidden in the default SSR render — a closed
    // dialog state by default.
    expect(confirmMatch?.[0]).toContain("hidden");
  });

  test("submit button has data-delete-submit and lives inside form action='?/delete'", () => {
    const { body } = render(DangerZone, {
      props: { projectId: "01J0PROJECT", projectName: "Demo" },
    });
    // Form post target is the `?/delete` named action.
    const formMatch = body.match(/<form\b[^>]*data-delete-form[^>]*>[\s\S]*?<\/form>/);
    expect(formMatch).not.toBeNull();
    expect(formMatch?.[0]).toContain('action="?/delete"');
    expect(formMatch?.[0]).toContain('method="POST"');
    expect(formMatch?.[0]).toContain("data-delete-submit");
  });

  test("cancel button has data-delete-cancel and is type=button", () => {
    const { body } = render(DangerZone, {
      props: { projectId: "01J0PROJECT", projectName: "Demo" },
    });
    const cancelMatch = body.match(/<button\b[^>]*data-delete-cancel[^>]*>/);
    expect(cancelMatch).not.toBeNull();
    expect(cancelMatch?.[0]).toContain('type="button"');
  });
});
