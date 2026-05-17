import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";

const { actions, load } = await import("../../src/routes/settings/errors/+page.server");

const session = { id: "session-1", userId: "user-1" };
const apiRows = [
  {
    id: "err-1",
    occurredAt: "2026-05-03T10:00:00.000Z",
    errorMessage: "Unhandled rejection",
    os: "darwin",
    fulcrumVersion: "0.1.0",
    stackTrace: "Error: fail\n at run (<cwd>/apps/cli/src/main.ts:1:1)",
    context: { source: "unhandledRejection" },
  },
];
const errors = [
  {
    id: "err-1",
    occurred_at: "2026-05-03T10:00:00.000Z",
    message: "Unhandled rejection",
    os: "darwin",
    version: "0.1.0",
    stack_trace: "Error: fail\n at run (<cwd>/apps/cli/src/main.ts:1:1)",
    context: { source: "unhandledRejection" },
  },
];

const jsonResponse = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

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
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: apiRows, total: 1 }));

    const data = await load(event(fetchFn as unknown as typeof fetch));
    const payload = await data.streamed.data;

    expect(payload.errors).toEqual(errors);
    expect(payload.total).toBe(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain("/api/v1/error-logs?");
    expect(String(fetchFn.mock.calls[0][0])).toContain("includeTotal=true");
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
    await waitFor(() => expect(container.querySelector("[data-stack-trace]")?.textContent).toContain("<cwd>/apps/cli/src/main.ts"));
  });

  test("clearBefore action deletes local rows", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    const formData = new FormData();
    formData.set("before", "2026-05-03T00:00:00.000Z");

    const result = await actions.clearBefore({
      ...event(fetchFn as unknown as typeof fetch),
      request: {
        headers: new Headers({ cookie: "sid=abc" }),
        formData: async () => formData,
      },
    });

    expect(result).toEqual({ success: true });
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/error-logs?"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(String(fetchFn.mock.calls[0][0])).toContain("before=2026-05-03T00%3A00%3A00.000Z");
  });
});
