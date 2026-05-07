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

function makeRequest(body: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  return { request: { formData: () => Promise.resolve(fd) } } as Parameters<typeof actions.clearBefore>[0];
}

describe("/settings/errors actions", () => {
  it("clearBefore: requires before date", async () => {
    const result = await actions.clearBefore(makeRequest({}));
    expect(result).toMatchObject({ status: 400 });
  });

  it("clearBefore: deletes rows before date", async () => {
    const result = await actions.clearBefore(makeRequest({ before: "2025-01-01T00:00" }));
    expect(result).toMatchObject({ success: true });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM error_logs"),
      ["2025-01-01T00:00"],
    );
  });
});
