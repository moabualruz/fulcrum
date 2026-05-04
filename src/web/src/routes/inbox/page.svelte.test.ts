import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { NotificationRow, ActivityRow } from "./+page.server.ts";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/inbox"),
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
  data: {
    notifications: NotificationRow[];
    unreadCount: number;
    activity: ActivityRow[];
    activityPage: number;
    activityTotal: number;
  };
};

const UNREAD_NOTIFICATION: NotificationRow = {
  id: "notif-1",
  org_id: "org-1",
  recipient: "local",
  event_id: null,
  subject_kind: "task",
  subject_id: "task-1",
  verb: "created",
  actor: "system",
  read_at: null,
  created_at: "2026-04-30T10:00:00.000Z",
};

const READ_NOTIFICATION: NotificationRow = {
  ...UNREAD_NOTIFICATION,
  id: "notif-2",
  read_at: "2026-04-30T11:00:00.000Z",
};

const ACTIVITY: ActivityRow = {
  id: "ev-1",
  org_id: "org-1",
  project_id: null,
  actor: "local",
  subject_kind: "doc",
  subject_id: "doc-1",
  verb: "updated",
  payload: {},
  created_at: "2026-04-30T09:00:00.000Z",
};

describe("/inbox +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders heading with Inbox", () => {
    const { body } = render(Page, {
      props: {
        data: { notifications: [], unreadCount: 0, activity: [], activityPage: 1, activityTotal: 0 },
      },
    });
    expect(body).toMatch(/<h1\b[^>]*>[\s\S]*Inbox[\s\S]*<\/h1>/);
  });

  test("shows bell badge when unread count > 0", () => {
    const { body } = render(Page, {
      props: {
        data: {
          notifications: [UNREAD_NOTIFICATION],
          unreadCount: 1,
          activity: [],
          activityPage: 1,
          activityTotal: 0,
        },
      },
    });
    expect(body).toContain("data-bell-badge");
  });

  test("no bell badge when unread count is 0", () => {
    const { body } = render(Page, {
      props: {
        data: {
          notifications: [READ_NOTIFICATION],
          unreadCount: 0,
          activity: [],
          activityPage: 1,
          activityTotal: 0,
        },
      },
    });
    expect(body).not.toContain("data-bell-badge");
  });

  test("shows mark-all-read button when unreadCount > 0", () => {
    const { body } = render(Page, {
      props: {
        data: {
          notifications: [UNREAD_NOTIFICATION],
          unreadCount: 1,
          activity: [],
          activityPage: 1,
          activityTotal: 0,
        },
      },
    });
    expect(body).toContain("data-mark-all-read");
  });

  test("renders tab bar with For you and My activity", () => {
    const { body } = render(Page, {
      props: {
        data: { notifications: [], unreadCount: 0, activity: [], activityPage: 1, activityTotal: 0 },
      },
    });
    expect(body).toContain("data-inbox-tabs");
    expect(body).toContain("For you");
    expect(body).toContain("My activity");
  });

  test("renders notification cards with actor, verb, subject", () => {
    const { body } = render(Page, {
      props: {
        data: {
          notifications: [UNREAD_NOTIFICATION],
          unreadCount: 1,
          activity: [],
          activityPage: 1,
          activityTotal: 0,
        },
      },
    });
    expect(body).toContain("data-notification-actor");
    expect(body).toContain("system");
    expect(body).toContain("data-notification-verb");
    expect(body).toContain("created");
  });

  test("renders empty state when no notifications", () => {
    const { body } = render(Page, {
      props: {
        data: { notifications: [], unreadCount: 0, activity: [], activityPage: 1, activityTotal: 0 },
      },
    });
    expect(body).toContain("data-inbox-empty");
  });
});
