import { describe, expect, test } from "bun:test";
import { parseKernelMarkdown, serializeKernelMarkdown } from "./markdown.ts";

const fixture = `---
id: 01JTEST0000000000000000000
kind: decision
labels:
  - architecture
  - backend
status: accepted
---

# Title

Body with **Markdown** and a link to [Fulcrum](../README.md).
`;

describe("kernel markdown", () => {
  test("parses YAML frontmatter and body", () => {
    const parsed = parseKernelMarkdown(fixture);
    expect(parsed.frontmatter["id"]).toBe("01JTEST0000000000000000000");
    expect(parsed.frontmatter["labels"]).toEqual(["architecture", "backend"]);
    expect(parsed.body).toContain("# Title");
    expect(parsed.body).toContain("[Fulcrum](../README.md)");
  });

  test("serializes without changing body text", () => {
    const parsed = parseKernelMarkdown(fixture);
    const serialized = serializeKernelMarkdown(parsed);
    expect(serialized).toBe(fixture);
  });

  test("treats input without frontmatter as body-only", () => {
    const noFront = "# heading only\n\nbody\n";
    const parsed = parseKernelMarkdown(noFront);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe(noFront);
  });
});
