import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDb = {
  query: vi.fn(),
  close: vi.fn(),
};
vi.mock("$lib/server/db", () => ({
  openProductDb: vi.fn(() => Promise.resolve(mockDb)),
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
  return { request: { formData: () => Promise.resolve(fd) } } as Parameters<typeof actions.add>[0];
}

describe("/settings/secrets actions", () => {
  it("add: requires name and value", async () => {
    const result = await actions.add(makeRequest({ name: "", value: "" }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("add: inserts credential", async () => {
    mockDb.query.mockResolvedValue([]);
    const result = await actions.add(makeRequest({ name: "MY_KEY", value: "secret123", provider: "aws" }));
    expect(result).toMatchObject({ success: true });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO credentials"),
      expect.arrayContaining(["MY_KEY", "aws"]),
    );
  });

  it("rotate: requires id and value", async () => {
    const result = await actions.rotate(makeRequest({ id: "", value: "" }));
    expect(result).toMatchObject({ status: 400 });
  });

  it("rotate: updates value_hash and last_used_at", async () => {
    const result = await actions.rotate(makeRequest({ id: "abc", value: "newvalue" }));
    expect(result).toMatchObject({ success: true });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("last_used_at"),
      expect.arrayContaining(["abc"]),
    );
  });

  it("archive: toggles archived", async () => {
    const result = await actions.archive(makeRequest({ id: "abc" }));
    expect(result).toMatchObject({ success: true });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("archived = NOT archived"),
      ["abc"],
    );
  });

  it("delete: removes row", async () => {
    const result = await actions.delete(makeRequest({ id: "abc" }));
    expect(result).toMatchObject({ success: true });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM credentials"),
      ["abc"],
    );
  });

  it("add: value never stored as plaintext in DB call args", async () => {
    await actions.add(makeRequest({ name: "TEST", value: "plaintext-secret", provider: "" }));
    const calls = mockDb.query.mock.calls;
    for (const [, args] of calls) {
      if (Array.isArray(args)) {
        for (const arg of args) {
          expect(arg).not.toBe("plaintext-secret");
        }
      }
    }
  });
});
