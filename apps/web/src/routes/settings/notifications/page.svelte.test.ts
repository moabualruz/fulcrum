import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/settings/notifications"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

mock.module("$app/environment", () => ({ browser: false, dev: false, building: false, version: "" }));

type PageProps = {
  data: { retainDays: number; saved: boolean };
  form: { retainDays: number; saved: boolean } | null;
};

describe("/settings/notifications +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders header with 'Notification settings'", () => {
    const { body } = render(Page, { props: { data: { retainDays: 0, saved: false }, form: null } });
    expect(body).toMatch(/Notification settings/);
  });

  test("renders retain_days input with value", () => {
    const { body } = render(Page, { props: { data: { retainDays: 30, saved: false }, form: null } });
    expect(body).toContain("data-retain-days-input");
    expect(body).toContain('value="30"');
  });

  test("retain_days=0 renders value 0", () => {
    const { body } = render(Page, { props: { data: { retainDays: 0, saved: false }, form: null } });
    expect(body).toContain('value="0"');
  });

  test("shows saved message when form.saved is true", () => {
    const { body } = render(Page, {
      props: {
        data: { retainDays: 0, saved: false },
        form: { retainDays: 30, saved: true },
      },
    });
    expect(body).toContain("data-retention-saved");
    expect(body).toContain("Retention policy saved");
  });

  test("does not show saved message when form is null", () => {
    const { body } = render(Page, { props: { data: { retainDays: 0, saved: false }, form: null } });
    expect(body).not.toContain("data-retention-saved");
  });

  test("save button present", () => {
    const { body } = render(Page, { props: { data: { retainDays: 0, saved: false }, form: null } });
    expect(body).toContain("data-save-retention");
  });
});
