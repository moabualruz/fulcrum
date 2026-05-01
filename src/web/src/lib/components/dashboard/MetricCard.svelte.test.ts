import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type MetricCardProps = {
  label: string;
  value: number | string;
  href?: string;
};

describe("MetricCard component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let MetricCard: Component<MetricCardProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./MetricCard.svelte")) as {
      default: Component<MetricCardProps>;
    };
    MetricCard = mod.default;
  });

  test("renders data-metric-card with label and value", () => {
    const { body } = render(MetricCard, {
      props: { label: "Total runs", value: 42 },
    });
    expect(body).toContain("data-metric-card");
    expect(body).toContain("data-metric-value");
    expect(body).toContain("42");
    expect(body).toContain("Total runs");
  });

  test("renders <a> tag when href is set", () => {
    const { body } = render(MetricCard, {
      props: { label: "Runs", value: 10, href: "/runs" },
    });
    expect(body).toMatch(/<a\b[^>]*data-metric-card[^>]*href="\/runs"/);
  });

  test("renders <div> tag when href is undefined", () => {
    const { body } = render(MetricCard, {
      props: { label: "Docs", value: 5 },
    });
    expect(body).toMatch(/<div\b[^>]*data-metric-card/);
    expect(body).not.toMatch(/<a\b[^>]*data-metric-card/);
  });

  test("data-metric-label-text contains label text", () => {
    const { body } = render(MetricCard, {
      props: { label: "Active tasks", value: "7" },
    });
    expect(body).toContain("data-metric-label-text");
    expect(body).toContain("Active tasks");
  });
});
