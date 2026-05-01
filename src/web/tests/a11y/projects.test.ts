import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import { auditRoute, mockSvelteKitRoute } from "./runs-helpers";

mockSvelteKitRoute("/projects");

interface ProjectListing {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string;
}

interface PageProps {
  data: {
    activeProjectId: string | null;
    streamed: { data: Promise<{ projects: ProjectListing[] }> | { projects: ProjectListing[] } };
  };
}

const projects: ProjectListing[] = [
  {
    id: "01J0PROJECT0000000000000001",
    slug: "alpha",
    name: "Alpha",
    description: "first sample project",
    updated_at: "2026-04-30T12:00:00.000Z",
  },
];

describe("projects route a11y", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("../../src/routes/projects/+page.svelte")) as unknown as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("no axe-core serious/critical violations on /projects", async () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: "alpha",
          streamed: { data: { projects } },
        },
      },
    });
    const result = await auditRoute(body);
    const severe = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(severe).toEqual([]);
  });
});
