import { describe, expect, test } from "bun:test";
import { buildCollabExtensions, collabProviderUrl } from "./client.ts";

const FLAG_ON = { FULCRUM_FEATURES: "real-time-collab-server" };
const FLAG_OFF = { FULCRUM_FEATURES: "" };

describe("buildCollabExtensions", () => {
  test("flag OFF → empty array (no collab extensions)", () => {
    const exts = buildCollabExtensions("t1", { id: "u1", name: "Alice" }, FLAG_OFF);
    expect(exts).toEqual([]);
  });

  test("flag ON → returns collaboration + collaborationCursor descriptors", () => {
    const exts = buildCollabExtensions("t1", { id: "u1", name: "Alice" }, FLAG_ON);
    expect(exts).toHaveLength(2);
    const [collaboration, cursor] = exts;
    if (!collaboration || !cursor) throw new Error("expected collab descriptors");
    expect(collaboration.name).toBe("collaboration");
    expect(collaboration.config.room).toBe("task:t1");
    expect(cursor.name).toBe("collaborationCursor");
    expect((cursor.config.user as { name: string }).name).toBe("Alice");
  });

  test("flag ON → cursor user colour derived from user ID", () => {
    const exts = buildCollabExtensions("t1", { id: "u1", name: "Alice" }, FLAG_ON);
    const cursor = exts[1];
    if (!cursor) throw new Error("expected cursor descriptor");
    const color = (cursor.config.user as { color: string }).color;
    expect(color).toMatch(/^hsl\(\d+, 70%, 50%\)$/);
  });

  test("no CollaborationExtension in list when flag OFF", () => {
    const exts = buildCollabExtensions("t1", { id: "u1", name: "Alice" }, FLAG_OFF);
    const names = exts.map((e) => e.name);
    expect(names).not.toContain("collaboration");
    expect(names).not.toContain("collaborationCursor");
  });
});

describe("collabProviderUrl", () => {
  test("flag OFF → null", () => {
    expect(collabProviderUrl("t1", {}, FLAG_OFF)).toBeNull();
  });

  test("flag ON → ws URL with room", () => {
    const url = collabProviderUrl("t1", {}, FLAG_ON);
    expect(url).toBe("ws://localhost:1234/task:t1");
  });

  test("custom host/port", () => {
    const url = collabProviderUrl("t1", { host: "example.com", port: 5678 }, FLAG_ON);
    expect(url).toBe("ws://example.com:5678/task:t1");
  });
});
