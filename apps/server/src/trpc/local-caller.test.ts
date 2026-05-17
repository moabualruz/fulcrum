import { describe, expect, test } from "bun:test";

import { AppUnauthorizedError } from "@platform-core/domain/errors.ts";
import {
  createApplicationLocalCaller,
  requireCliTuiSessionContext,
} from "./local-caller.ts";

describe("CLI/TUI local caller session boundary", () => {
  test("missing required sessions raise application errors before tRPC caller creation", async () => {
    await expect(createApplicationLocalCaller({ requireSession: true }))
      .rejects.toBeInstanceOf(AppUnauthorizedError);

    await expect(requireCliTuiSessionContext())
      .rejects.toBeInstanceOf(AppUnauthorizedError);
  });
});
