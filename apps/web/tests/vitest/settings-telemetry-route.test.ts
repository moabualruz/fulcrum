import { render } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";

const { actions, load } = await import("../../src/routes/settings/telemetry/+page.server");

function event(fetchFn: typeof fetch) {
  const url = new URL("http://localhost/settings/telemetry");
  return {
    locals: { session: { id: "session-1", userId: "user-1" }, orgId: "org-1" },
    fetch: fetchFn,
    request: new Request(url, { headers: { cookie: "sid=abc" } }),
    url,
  };
}

describe("/settings/telemetry route", () => {
  test("loads telemetry status through the public API and renders controls", async () => {
    const fetch = vi.fn(async () => Response.json({ opted_in: false, row_count: 7 })) as unknown as typeof fetch;
    const data = await load(event(fetch));
    const payload = await data.streamed.data;

    expect(payload).toEqual({ optIn: false, rowCount: 7 });

    const { default: TelemetryPage } = await import("../../src/routes/settings/telemetry/+page.svelte");
    const { getByRole, container, findByText } = render(TelemetryPage, {
      props: { data: { activeProjectId: null, streamed: { data: Promise.resolve(payload) } } },
    });

    expect(getByRole("heading", { name: "Telemetry" })).toBeTruthy();
    expect(await findByText("Telemetry opt-in")).toBeTruthy();
    expect(await findByText("7 rows")).toBeTruthy();
    expect(container.querySelector("[data-opt-in-toggle]")).toBeTruthy();
    expect(getByRole("button", { name: "Purge" })).toBeTruthy();
  });

  test("actions toggle opt-in and purge through the public API", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (String(input).includes("/status")) return Response.json({ optIn: false, rowCount: 7 });
      if (String(input).includes("/events")) return Response.json({ ok: true, deleted: 3 });
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;

    await expect(actions.toggleOptIn(event(fetch))).resolves.toEqual({ success: true, optIn: true });
    await expect(actions.purge(event(fetch))).resolves.toEqual({ success: true, rowCount: 3 });

    expect(calls).toEqual([
      "GET http://localhost/api/v1/telemetry/status?orgId=org-1&userId=user-1",
      "POST http://localhost/api/v1/telemetry/opt-in",
      "DELETE http://localhost/api/v1/telemetry/events?orgId=org-1&userId=user-1",
    ]);
  });
});
