import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./TiptapEditor.svelte", import.meta.url), "utf8");

describe("TiptapEditor source", () => {
  test("keeps embed provider detection wired into the slash-menu embed command", () => {
    expect(source).toContain("detectDocEmbedProvider");
    expect(source).toContain('{ label: "Embed", command: insertEmbedBlock }');
    expect(source).toContain('"data-doc-embed-provider": embed.provider');
    expect(source).toContain('"data-doc-embed-url": embed.embeddableUrl');
  });
});
