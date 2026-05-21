import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { RunStatus } from "$lib/server/runs";

type RunStatusBadgeProps = { status: RunStatus };

// RunStatusBadge delegates rendering to the `@fulcrum/ui-kit` StatusBadge
// primitive (ui-kit-first). The component keeps the run-domain `data-status`
// hook; the canonical label + OKLCH-tokened treatment come from the primitive.
describe("RunStatusBadge component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let RunStatusBadge: Component<RunStatusBadgeProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./RunStatusBadge.svelte")) as {
      default: Component<RunStatusBadgeProps>;
    };
    RunStatusBadge = mod.default;
  });

  // RunStatus value → canonical StatusBadge label (COPY.md §6 vocabulary).
  const matrix: Array<{ status: RunStatus; canonicalLabel: string }> = [
    { status: "succeeded", canonicalLabel: "Completed" },
    { status: "running", canonicalLabel: "Running" },
    { status: "queued", canonicalLabel: "Queued" },
    { status: "failed", canonicalLabel: "Failed" },
    { status: "cancelled", canonicalLabel: "Cancelled" },
  ];

  for (const { status, canonicalLabel } of matrix) {
    test(`status=${status}: keeps run-domain hook and renders the ui-kit primitive`, () => {
      const { body } = render(RunStatusBadge, { props: { status } });

      // Run-domain selector hooks are preserved for route-level assertions.
      expect(body).toContain("data-run-status");
      expect(body).toContain(`data-status="${status}"`);

      // Visual rendering comes from the ui-kit StatusBadge primitive.
      expect(body).toContain('data-slot="status-badge"');
      expect(body).toContain(canonicalLabel);
    });
  }

  test("does not hand-roll non-token palette classes", () => {
    for (const { status } of matrix) {
      const { body } = render(RunStatusBadge, { props: { status } });
      // The old hand-rolled implementation leaked Tailwind palette classes
      // (bg-emerald-100, bg-rose-100, …) instead of OKLCH design tokens.
      expect(body).not.toMatch(/bg-(emerald|rose|zinc|blue)-\d{2,3}/);
    }
  });
});
