import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

interface TileData {
  id: string;
  name: string;
  openTasks: number;
  lastActivity: string | null;
}

interface Props {
  tiles: TileData[];
}

describe("ProjectTiles", () => {
  let render: typeof import("svelte/server").render;
  let ProjectTiles: Component<Props>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./ProjectTiles.svelte")) as { default: Component<Props> };
    ProjectTiles = mod.default;
  });

  test("renders project tiles with name and open task count", () => {
    const tiles: TileData[] = [
      { id: "1", name: "Alpha", openTasks: 5, lastActivity: new Date().toISOString() },
      { id: "2", name: "Beta", openTasks: 0, lastActivity: null },
    ];
    const { body } = render(ProjectTiles, { props: { tiles } });
    expect(body).toContain("Alpha");
    expect(body).toContain("Beta");
    expect(body).toContain("data-project-tile");
    expect(body).toContain('href="/projects/1"');
    expect(body).toContain('href="/projects/2"');
  });

  test("renders empty state when no tiles", () => {
    const { body } = render(ProjectTiles, { props: { tiles: [] } });
    expect(body).toContain("data-project-tiles-empty");
  });

  test("shows open task count per tile", () => {
    const tiles: TileData[] = [
      { id: "1", name: "Alpha", openTasks: 3, lastActivity: null },
    ];
    const { body } = render(ProjectTiles, { props: { tiles } });
    expect(body).toContain("3");
    expect(body).toContain("data-open-tasks");
  });
});
