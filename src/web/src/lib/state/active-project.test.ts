import { beforeEach, describe, expect, test } from "bun:test";

import {
  ACTIVE_PROJECT_COOKIE,
  clearActiveProject,
  getActiveProject,
  setActiveProject,
} from "./active-project.ts";

type SetCall = {
  name: string;
  value: string;
  opts: Record<string, unknown>;
};
type DeleteCall = { name: string; opts: Record<string, unknown> };

function createCookiesStub(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(ACTIVE_PROJECT_COOKIE, initial);
  const setCalls: SetCall[] = [];
  const deleteCalls: DeleteCall[] = [];
  return {
    get(name: string): string | undefined {
      return store.get(name);
    },
    set(name: string, value: string, opts: Record<string, unknown>): void {
      store.set(name, value);
      setCalls.push({ name, value, opts });
    },
    delete(name: string, opts: Record<string, unknown>): void {
      store.delete(name);
      deleteCalls.push({ name, opts });
    },
    _setCalls: setCalls,
    _deleteCalls: deleteCalls,
    _store: store,
  };
}

describe("active-project cookie module", () => {
  let stub: ReturnType<typeof createCookiesStub>;

  beforeEach(() => {
    stub = createCookiesStub();
  });

  test("getActiveProject returns null when cookie unset", () => {
    expect(getActiveProject(stub as never)).toBeNull();
  });

  test("setActiveProject writes cookie with correct options", () => {
    setActiveProject(stub as never, "fulcrum");
    expect(stub._setCalls).toHaveLength(1);
    const call = stub._setCalls[0]!;
    expect(call.name).toBe(ACTIVE_PROJECT_COOKIE);
    expect(call.value).toBe("fulcrum");
    expect(call.opts).toEqual({
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 31_536_000,
    });
  });

  test("getActiveProject returns slug after setActiveProject", () => {
    setActiveProject(stub as never, "fulcrum");
    expect(getActiveProject(stub as never)).toBe("fulcrum");
  });

  test("setActiveProject(null) deletes cookie and getActiveProject returns null", () => {
    setActiveProject(stub as never, "fulcrum");
    setActiveProject(stub as never, null);
    expect(stub._deleteCalls).toHaveLength(1);
    expect(stub._deleteCalls[0]).toEqual({
      name: ACTIVE_PROJECT_COOKIE,
      opts: { path: "/" },
    });
    expect(getActiveProject(stub as never)).toBeNull();
  });

  test("clearActiveProject deletes cookie and getActiveProject returns null", () => {
    setActiveProject(stub as never, "fulcrum");
    clearActiveProject(stub as never);
    expect(stub._deleteCalls).toHaveLength(1);
    expect(stub._deleteCalls[0]).toEqual({
      name: ACTIVE_PROJECT_COOKIE,
      opts: { path: "/" },
    });
    expect(getActiveProject(stub as never)).toBeNull();
  });

  test("setActiveProject throws on invalid slug", () => {
    expect(() => setActiveProject(stub as never, "FOO BAR")).toThrow(
      "invalid project slug: FOO BAR",
    );
    expect(() => setActiveProject(stub as never, "-leading")).toThrow();
    expect(() => setActiveProject(stub as never, "")).toThrow();
    expect(stub._setCalls).toHaveLength(0);
  });

  test("getActiveProject returns null when stored value fails the regex", () => {
    const dirty = createCookiesStub("   ");
    expect(getActiveProject(dirty as never)).toBeNull();

    const upper = createCookiesStub("FULCRUM");
    expect(getActiveProject(upper as never)).toBeNull();

    const leadingHyphen = createCookiesStub("-leading");
    expect(getActiveProject(leadingHyphen as never)).toBeNull();

    const empty = createCookiesStub("");
    expect(getActiveProject(empty as never)).toBeNull();
  });
});
