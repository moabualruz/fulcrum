import { render } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";

const { db, queries } = vi.hoisted(() => {
  const queries: Array<{ sql: string }> = [];
  const db = {
    query: vi.fn(async (sql: string) => {
      queries.push({ sql });
      if (sql.includes("SELECT opt_in")) return [{ opt_in: false }];
      if (sql.includes("SELECT count(*) as count FROM telemetry_events")) return [{ count: "7" }];
      return [];
    }),
    close: vi.fn(async () => {}),
  };
  return { db, queries };
});

vi.mock("$lib/server/db", () => ({
  openProductDb: async () => db,
}));

const { actions, load } = await import("../../src/routes/settings/telemetry/+page.server");

function event(fetchFn: typeof fetch) {
  return {
    locals: { session: { id: "session-1", userId: "user-1" } },
    fetch: fetchFn,
    request: { headers: new Headers({ cookie: "sid=abc" }) },
    url: new URL("http://localhost/settings/telemetry"),
  };
}

describe("/settings/telemetry route", () => {
  test("loads local telemetry status and renders controls", async () => {
    queries.length = 0;
    const data = await load(event(vi.fn() as unknown as typeof fetch));
    const payload = await data.streamed.data;

    expect(payload).toEqual({ optIn: false, rowCount: 7 });
    expect(queries.some((query) => query.sql.includes("SELECT opt_in"))).toBe(true);

    const { default: TelemetryPage } = await import("../../src/routes/settings/telemetry/+page.svelte");
    const { getByRole, getByText, container, findByText } = render(TelemetryPage, {
      props: { data: { activeProjectId: null, streamed: { data: Promise.resolve(payload) } } },
    });

    expect(getByRole("heading", { name: "Telemetry" })).toBeTruthy();
    expect(await findByText("Telemetry opt-in")).toBeTruthy();
    expect(await findByText("7 rows")).toBeTruthy();
    expect(container.querySelector("[data-opt-in-toggle]")).toBeTruthy();
    expect(getByRole("button", { name: "Purge" })).toBeTruthy();
  });

  test("actions toggle opt-in and purge local rows", async () => {
    queries.length = 0;

    await actions.toggleOptIn(event(vi.fn() as unknown as typeof fetch));
    await expect(actions.purge(event(vi.fn() as unknown as typeof fetch))).resolves.toEqual({
      success: true,
      rowCount: 0,
    });

    expect(queries.some((query) => query.sql.includes("UPDATE telemetry_settings SET opt_in = NOT opt_in"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("DELETE FROM telemetry_events"))).toBe(true);
  });
});
