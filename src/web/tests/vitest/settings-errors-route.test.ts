import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";

const { db, errors, queries } = vi.hoisted(() => {
  const errors = [
    {
      id: "err-1",
      occurred_at: "2026-05-03T10:00:00.000Z",
      message: "Unhandled rejection",
      os: "darwin",
      version: "0.1.0",
      stack_trace: "Error: fail\n at run (<cwd>/src/index.ts:1:1)",
      context: { source: "unhandledRejection" },
    },
  ];
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const db = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes("SELECT count(*) as count FROM error_logs")) return [{ count: "1" }];
      if (sql.includes("SELECT id, message")) return errors;
      return [];
    }),
    close: vi.fn(async () => {}),
  };
  return { db, errors, queries };
});

vi.mock("$lib/server/db", () => ({
  openIsolatedStore: async () => db,
}));

const { actions, load } = await import("../../src/routes/settings/errors/+page.server");

const session = { id: "session-1", userId: "user-1" };

function event(fetchFn: typeof fetch) {
  return {
    locals: { session },
    fetch: fetchFn,
    request: { headers: new Headers({ cookie: "sid=abc" }) },
    url: new URL("http://localhost/settings/errors"),
  };
}

describe("/settings/errors route", () => {
  test("load fetches paginated local error rows", async () => {
    queries.length = 0;

    const data = await load(event(vi.fn() as unknown as typeof fetch));
    const payload = await data.streamed.data;

    expect(payload.errors).toEqual(errors);
    expect(payload.total).toBe(1);
    expect(queries.some((query) => query.sql.includes("ORDER BY occurred_at DESC LIMIT $1 OFFSET $2"))).toBe(true);
  });

  test("renders crashlog rows with stack details", async () => {
    const { default: ErrorsPage } = await import("../../src/routes/settings/errors/+page.svelte");
    const { getByRole, findByText, container } = render(ErrorsPage, {
      props: {
        data: { activeProjectId: null, streamed: { data: Promise.resolve({ errors, total: 1, page: 1, pageSize: 20 }) } },
      },
    });

    expect(getByRole("heading", { name: "Error logs" })).toBeTruthy();
    expect(await findByText("Unhandled rejection")).toBeTruthy();
    await fireEvent.click(container.querySelector("[data-expand-btn]")!);
    await waitFor(() => expect(container.querySelector("[data-stack-trace]")?.textContent).toContain("<cwd>/src/index.ts"));
  });

  test("clearBefore action deletes local rows", async () => {
    queries.length = 0;
    const formData = new FormData();
    formData.set("before", "2026-05-03T00:00:00.000Z");

    const result = await actions.clearBefore({
      ...event(vi.fn() as unknown as typeof fetch),
      request: {
        headers: new Headers({ cookie: "sid=abc" }),
        formData: async () => formData,
      },
    });

    expect(result).toEqual({ success: true });
    expect(queries.some((query) => query.sql.includes("DELETE FROM error_logs WHERE occurred_at < $1"))).toBe(true);
  });
});
