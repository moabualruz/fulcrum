import { describe, expect, test } from "bun:test";
import { createFulcrumStore } from "./state/store.ts";

describe("fulcrum state store", () => {
  test("subscribes to project changes", () => {
    const store = createFulcrumStore();
    const seen: (string | null)[] = [];
    const unsubscribe = store.subscribe((state) => {
      seen.push(state.activeProjectId);
    });
    store.getState().setActiveProject("01JPROJECT0000000000000000");
    unsubscribe();
    expect(seen).toContain("01JPROJECT0000000000000000");
  });

  test("clears active project when set to null", () => {
    const store = createFulcrumStore();
    store.getState().setActiveProject("01JABC");
    expect(store.getState().activeProjectId).toBe("01JABC");
    store.getState().setActiveProject(null);
    expect(store.getState().activeProjectId).toBeNull();
  });
});
