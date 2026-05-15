import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";

const { appScope, clearSettingsErrors, errors, listSettingsErrors } = vi.hoisted(() => {
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
  const appScope = {
    em: { kind: "entity-manager" },
    ctx: { orgId: "org-1", userId: "user-1", projectId: null },
  };
  const listSettingsErrors = vi.fn(async () => ({ errors, total: 1, page: 1, pageSize: 20 }));
  const clearSettingsErrors = vi.fn(async () => ({ success: true as const }));
  return { appScope, clearSettingsErrors, errors, listSettingsErrors };
});

vi.mock("$lib/server/application-scope", () => ({
  requestAppScope: async () => appScope,
}));

vi.mock("@platform-core/application/settings/queries.ts", () => ({
  listSettingsErrors,
}));

vi.mock("@platform-core/application/settings/commands.ts", () => ({
  clearSettingsErrors,
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
    listSettingsErrors.mockClear();

    const data = await load(event(vi.fn() as unknown as typeof fetch));
    const payload = await data.streamed.data;

    expect(payload.errors).toEqual(errors);
    expect(payload.total).toBe(1);
    expect(listSettingsErrors).toHaveBeenCalledWith(appScope.em, appScope.ctx, { page: 1, pageSize: 20 });
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
    clearSettingsErrors.mockClear();
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
    expect(clearSettingsErrors).toHaveBeenCalledWith(appScope.em, appScope.ctx, {
      before: "2026-05-03T00:00:00.000Z",
    });
  });
});
