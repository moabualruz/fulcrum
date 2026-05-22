import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

// `/projects/+page.server.ts` is a pure invocation layer: its `load` streams
// `listProjectRowsForEvent` (from $lib/server/project-api), which calls the
// NestJS project public API. This suite mocks that client seam — no in-process
// database, no application-scope.
let rows: Array<{
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string;
}> = [];
let suiteActive = false;

mock.module("$lib/server/project-api", () => ({
  // `mock.module` is process-global; answer only while this suite is active so
  // foreign suites get the real client.
  listProjectRowsForEvent: async () => (suiteActive ? rows : []),
}));

interface ProjectPayload {
  projects: typeof rows;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  rows = [];
});

describe("/projects +page.server.ts load()", () => {
  beforeAll(() => {
    suiteActive = true;
  });
  afterAll(() => {
    suiteActive = false;
  });
  afterEach(() => {
    rows = [];
  });

  test("streams the project rows the public API returns", async () => {
    rows = [
      { id: "id-first", slug: "first", name: "First", description: "earlier project", updated_at: "2026-04-01T00:00:00.000Z" },
      { id: "id-second", slug: "second", name: "Second", description: null, updated_at: "2026-04-02T00:00:00.000Z" },
    ];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: "first" },
    } as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBe("first");
    const payload = await streamedData<ProjectPayload>(result);
    expect(Array.isArray(payload.projects)).toBe(true);
    expect(payload.projects).toHaveLength(2);
    expect(payload.projects[0]?.id).toBe("id-first");
    expect(payload.projects[1]?.id).toBe("id-second");
    expect(payload.projects[0]?.slug).toBe("first");
    expect(payload.projects[1]?.slug).toBe("second");
  });

  test("returns empty array when the public API has no projects", async () => {
    rows = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBeNull();
    const payload = await streamedData<ProjectPayload>(result);
    expect(payload.projects).toEqual([]);
  });
});
