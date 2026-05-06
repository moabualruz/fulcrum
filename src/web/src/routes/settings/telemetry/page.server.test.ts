import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  query: vi.fn(),
  close: vi.fn(),
};
vi.mock("$lib/server/db", () => ({
  openIsolatedStore: vi.fn(() => Promise.resolve(mockDb)),
}));

import { actions } from "./+page.server.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.query.mockResolvedValue([]);
  mockDb.close.mockResolvedValue(undefined);
});

function makeEmptyRequest() {
  return { request: { formData: async () => new FormData() } } as Parameters<typeof actions.toggleOptIn>[0];
}

describe("/settings/telemetry actions", () => {
  it("toggleOptIn: flips opt_in", async () => {
    const result = await actions.toggleOptIn(makeEmptyRequest());
    expect(result).toMatchObject({ success: true });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("opt_in = NOT opt_in"),
    );
  });

  it("purge: deletes all telemetry events", async () => {
    const result = await actions.purge(makeEmptyRequest());
    expect(result).toMatchObject({ success: true, rowCount: 0 });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM telemetry_events"),
    );
  });
});
