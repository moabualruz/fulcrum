import { describe, expect, test } from "bun:test";
import { getStore, setActiveProject } from "./fulcrum-store.ts";

describe("web fulcrum-store wrapper", () => {
  test("subscribe sees activeProjectId mutations", () => {
    const seen: (string | null)[] = [];
    const store = getStore();
    const unsubscribe = store.subscribe((state) => {
      seen.push(state.activeProjectId);
    });
    setActiveProject("01JWEBTEST000000000000000A");
    setActiveProject(null);
    unsubscribe();
    expect(seen).toContain("01JWEBTEST000000000000000A");
    expect(seen).toContain(null);
  });
});
