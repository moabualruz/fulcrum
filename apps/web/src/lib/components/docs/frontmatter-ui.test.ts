import { describe, expect, test } from "bun:test";

import {
  dumpFrontmatterYaml,
  getFrontmatterFields,
  parseFrontmatterYaml,
  validateFrontmatter,
} from "./frontmatter-ui.ts";

describe("frontmatter UI model", () => {
  test("ADR validation reports missing consequences at .consequences", () => {
    const result = validateFrontmatter("adr", {
      status: "proposed",
      decision: "Use typed frontmatter",
      context: "Docs need structured metadata",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.consequences?.[0]).toBeString();
    expect(result.missingRequired).toEqual(["consequences"]);
  });

  test("fields are derived from Zod schemas with enum options and tag arrays", () => {
    expect(getFrontmatterFields("rfc")).toEqual([
      { name: "status", type: "enum", required: true, options: ["draft", "review", "accepted", "rejected"] },
      { name: "summary", type: "string", required: true },
    ]);

    expect(getFrontmatterFields("meeting")).toEqual([
      { name: "date", type: "string", required: true },
      { name: "attendees", type: "array", required: true },
    ]);
  });

  test("YAML toggle preserves unknown passthrough keys across form to YAML to form", () => {
    const value = {
      status: "proposed",
      decision: "d",
      context: "c",
      consequences: "co",
      extra: "preserved",
    };

    const yaml = dumpFrontmatterYaml(value);
    const parsed = parseFrontmatterYaml("adr", yaml, value);

    expect(parsed).toEqual({ ok: true, value });
  });

  test("invalid YAML returns an error and previous valid value", () => {
    const previous = { status: "proposed", decision: "d", context: "c", consequences: "co" };
    const parsed = parseFrontmatterYaml("adr", "status: [", previous);

    expect(parsed.ok).toBe(false);
    expect(parsed.value).toBe(previous);
    if (parsed.ok) return;
    expect(parsed.error).toContain("YAML");
  });
});
