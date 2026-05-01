import { describe, expect, test } from "bun:test";

import { load } from "./+layout.server.ts";

describe("+layout.server load", () => {
  test("returns activeProjectId when set in locals", async () => {
    const event = { locals: { activeProjectId: "fulcrum" } };
    const result = await load(event as never);
    expect(result).toEqual({ activeProjectId: "fulcrum" });
  });

  test("returns null activeProjectId when locals has null", async () => {
    const event = { locals: { activeProjectId: null } };
    const result = await load(event as never);
    expect(result).toEqual({ activeProjectId: null });
  });
});
