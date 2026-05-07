import { render } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";

const { appScope, getSettingsTelemetry, purgeSettingsTelemetry, toggleSettingsTelemetryOptIn } = vi.hoisted(() => {
  const appScope = {
    em: { kind: "entity-manager" },
    ctx: { orgId: "org-1", userId: "user-1", projectId: null },
  };
  const getSettingsTelemetry = vi.fn(async () => ({ optIn: false, rowCount: 7 }));
  const purgeSettingsTelemetry = vi.fn(async () => ({ success: true as const, rowCount: 0 }));
  const toggleSettingsTelemetryOptIn = vi.fn(async () => ({ success: true as const, optIn: true }));
  return { appScope, getSettingsTelemetry, purgeSettingsTelemetry, toggleSettingsTelemetryOptIn };
});

vi.mock("$lib/server/application-scope", () => ({
  requestAppScope: async () => appScope,
}));

vi.mock("../../../application/settings/queries.ts", () => ({
  getSettingsTelemetry,
}));

vi.mock("../../../application/settings/commands.ts", () => ({
  purgeSettingsTelemetry,
  toggleSettingsTelemetryOptIn,
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
    getSettingsTelemetry.mockClear();
    const data = await load(event(vi.fn() as unknown as typeof fetch));
    const payload = await data.streamed.data;

    expect(payload).toEqual({ optIn: false, rowCount: 7 });
    expect(getSettingsTelemetry).toHaveBeenCalledWith(appScope.em, appScope.ctx);

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
    toggleSettingsTelemetryOptIn.mockClear();
    purgeSettingsTelemetry.mockClear();

    await actions.toggleOptIn(event(vi.fn() as unknown as typeof fetch));
    await expect(actions.purge(event(vi.fn() as unknown as typeof fetch))).resolves.toEqual({
      success: true,
      rowCount: 0,
    });

    expect(toggleSettingsTelemetryOptIn).toHaveBeenCalledWith(appScope.em, appScope.ctx);
    expect(purgeSettingsTelemetry).toHaveBeenCalledWith(appScope.em, appScope.ctx);
  });
});
