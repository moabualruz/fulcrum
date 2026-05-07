import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { RunStatus } from "$lib/server/runs";

type RunStatusBadgeProps = { status: RunStatus };

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

  const matrix: Array<{ status: RunStatus; label: string; className: string }> = [
    {
      status: "succeeded",
      label: "Succeeded",
      className: "bg-emerald-100 text-emerald-900",
    },
    {
      status: "running",
      label: "Running",
      className: "bg-blue-100 text-blue-900 animate-pulse",
    },
    {
      status: "queued",
      label: "Queued",
      className: "bg-zinc-100 text-zinc-900",
    },
    {
      status: "failed",
      label: "Failed",
      className: "bg-rose-100 text-rose-900",
    },
    {
      status: "cancelled",
      label: "Cancelled",
      className: "bg-rose-100 text-rose-900",
    },
  ];

  for (const { status, label, className } of matrix) {
    test(`status=${status}: data-status + class + label`, () => {
      const { body } = render(RunStatusBadge, { props: { status } });
      expect(body).toContain("data-run-status");
      expect(body).toContain(`data-status="${status}"`);
      expect(body).toContain(className);
      expect(body).toMatch(
        new RegExp(`<span\\b[^>]*data-run-status[^>]*>${label}</span>`),
      );
    });
  }
});
