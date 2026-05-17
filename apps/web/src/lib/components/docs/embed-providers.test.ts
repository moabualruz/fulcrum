import { describe, expect, test } from "bun:test";

import { detectDocEmbedProvider } from "./embed-providers.ts";

describe("doc embed provider detection", () => {
  test.each([
    ["https://youtu.be/abc123", "youtube", "https://www.youtube.com/embed/abc123"],
    ["https://www.youtube.com/watch?v=def456", "youtube", "https://www.youtube.com/embed/def456"],
    ["https://vimeo.com/123456", "vimeo", "https://player.vimeo.com/video/123456"],
    ["https://www.figma.com/file/demo/Design", "figma", "https://www.figma.com/embed?embed_host=fulcrum&url=https%3A%2F%2Fwww.figma.com%2Ffile%2Fdemo%2FDesign"],
    ["https://www.loom.com/share/abc123", "loom", "https://www.loom.com/embed/abc123"],
    ["https://codepen.io/user/pen/xyz", "codepen", "https://codepen.io/user/embed/xyz"],
    ["https://gist.github.com/user/abcdef", "github-gist", "https://gist.github.com/user/abcdef"],
  ])("detects %s", (url, provider, embeddableUrl) => {
    expect(detectDocEmbedProvider(url)).toMatchObject({ provider, embeddableUrl });
  });

  test("falls back to generic embed for unknown or invalid URLs", () => {
    expect(detectDocEmbedProvider("https://example.com/report")).toMatchObject({
      provider: "generic",
      label: "Embed",
      embeddableUrl: "https://example.com/report",
    });
    expect(detectDocEmbedProvider("not a url")).toMatchObject({
      provider: "generic",
      embeddableUrl: "not a url",
    });
  });
});
