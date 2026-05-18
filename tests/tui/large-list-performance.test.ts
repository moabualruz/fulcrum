import { describe, expect, test } from "bun:test";

import { ArtifactsScreen, type TuiArtifact } from "@fulcrum/tui/screens/artifacts.ts";
import { MemoryBrowserScreen, type TuiMemory } from "@fulcrum/tui/screens/memory-browser.ts";
import { Renderer } from "@fulcrum/tui/renderer.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void, columns = 80): string {
  const tty = new FakeTTY({ columns, rows: 24 });
  render(new Renderer(tty));
  return tty.plainText();
}

function expectLinesWithin(text: string, width: number): void {
  for (const line of text.split("\n")) {
    expect(line.length).toBeLessThanOrEqual(width);
  }
}

describe("large-list terminal coverage", () => {
  test("memory browser renders a bounded virtual window and truncates long rows", async () => {
    const memories: TuiMemory[] = Array.from({ length: 1000 }, (_, index) => ({
      id: `memory-${index.toString().padStart(4, "0")}`,
      key: `memory-${index.toString().padStart(4, "0")}`,
      kind: "note",
      importance: "medium",
      source: "manual",
      projectId: "project-1",
      body: `very long memory body ${"x".repeat(200)} ${index}`,
    }));
    const screen = new MemoryBrowserScreen({
      viewportRows: 5,
      caller: {
        memories: {
          list: async () => memories,
          promote: async () => ({}),
        },
      },
    });

    await screen.load();
    let output = renderPlain((renderer) => screen.render(renderer), 72);
    expect(output).toContain("memory-0000");
    expect(output).toContain("memory-0004");
    expect(output).not.toContain("memory-0005");
    expectLinesWithin(output, 72);

    for (let index = 0; index < 8; index++) await screen.handleKey("j");
    output = renderPlain((renderer) => screen.render(renderer), 72);
    expect(output).not.toContain("memory-0000");
    expect(output).toContain("memory-0008");
    expectLinesWithin(output, 72);
  });

  test("artifact screen renders a bounded list and first 50 preview lines", async () => {
    const artifacts: TuiArtifact[] = Array.from({ length: 1000 }, (_, index) => ({
      id: `artifact-${index.toString().padStart(4, "0")}`,
      filename: `artifact-${index.toString().padStart(4, "0")}-${"x".repeat(120)}.txt`,
      mime: "text/plain",
      path: `/workspace/out/artifact-${index}.txt`,
      sizeBytes: 2048,
      runId: "run-1",
    }));
    const screen = new ArtifactsScreen({
      viewportRows: 4,
      caller: {
        artifacts: {
          list: async () => artifacts,
          get: async () => ({
            kind: "text",
            artifact: { id: "artifact-0", filename: "artifact.txt", path: "/tmp/artifact.txt", mime: "text/plain" },
            language: "text",
            content: Array.from({ length: 100 }, (_, index) => `line-${index.toString().padStart(2, "0")} ${"y".repeat(120)}`).join("\n"),
            truncated: true,
          }),
          upload: async (input) => ({ id: "uploaded", path: input.path }),
          download: async (_input) => ({ ok: true, path: "/tmp/out" }),
          archive: async (input) => ({ ok: true, id: input.id }),
          delete: async (input) => ({ ok: true, id: input.id }),
        },
      },
    });

    await screen.load();
    const output = renderPlain((renderer) => screen.render(renderer), 80);
    expect(output).toContain("artifact-0000");
    expect(output).toContain("artifact-0003");
    expect(output).not.toContain("artifact-0004");
    expect(output).toContain("line-49");
    expect(output).not.toContain("line-50");
    expectLinesWithin(output, 80);
  });
});
