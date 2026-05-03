import { describe, expect, test } from "bun:test";
import { load } from "./+page.server";

describe("/projects/[id]/board +page.server", () => {
  test("exports a loader for project board route", () => {
    expect(typeof load).toBe("function");
  });
});
