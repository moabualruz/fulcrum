import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { MemberRow } from "./+page.server.ts";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/settings/users"),
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

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));

mock.module("$app/environment", () => ({
  browser: false,
  dev: false,
  building: false,
  version: "",
}));

const MEMBERS: MemberRow[] = [
  { id: "m1", userId: "user-alice", orgId: "org-001", role: "owner", joinedAt: "2024-01-01T00:00:00.000Z", email: "alice@example.com", emailVerified: true },
  { id: "m2", userId: "user-bob", orgId: "org-001", role: "member", joinedAt: "2024-02-15T00:00:00.000Z", email: "bob@example.com", emailVerified: false },
];

type PageProps = {
  data: { members: MemberRow[]; sessions?: Array<Record<string, unknown>> };
  form?: Record<string, unknown>;
};

describe("/settings/users +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders h1 'User Management'", () => {
    const { body } = render(Page, { props: { data: { members: [] } } });
    expect(body).toMatch(/<h1\b[^>]*>User Management<\/h1>/);
  });

  test("renders invite section", () => {
    const { body } = render(Page, { props: { data: { members: [] } } });
    expect(body).toContain("data-invite-section");
    expect(body).toContain("data-invite-submit");
  });

  test("renders invite form fields: email and role", () => {
    const { body } = render(Page, { props: { data: { members: [] } } });
    expect(body).toContain('name="email"');
    expect(body).toContain('name="role"');
  });

  test("renders members table when members present", () => {
    const { body } = render(Page, { props: { data: { members: MEMBERS } } });
    expect(body).toContain("data-members-table");
    expect(body).toContain("user-alice");
    expect(body).toContain("user-bob");
  });

  test("shows empty state when no members", () => {
    const { body } = render(Page, { props: { data: { members: [] } } });
    expect(body).toContain("No members found");
  });

  test("renders role dropdown per member", () => {
    const { body } = render(Page, { props: { data: { members: MEMBERS } } });
    expect(body).toContain(`data-member-role="user-alice"`);
    expect(body).toContain(`data-member-role="user-bob"`);
  });

  test("renders remove button per member", () => {
    const { body } = render(Page, { props: { data: { members: MEMBERS } } });
    expect(body).toContain(`data-member-remove="user-alice"`);
    expect(body).toContain(`data-member-remove="user-bob"`);
  });

  test("shows invite error from form", () => {
    const { body } = render(Page, {
      props: { data: { members: [] }, form: { inviteError: "Email already invited" } },
    });
    expect(body).toContain("data-invite-error");
    expect(body).toContain("Email already invited");
  });

  test("shows invite token from form", () => {
    const { body } = render(Page, {
      props: { data: { members: [] }, form: { inviteToken: "tok-abc123" } },
    });
    expect(body).toContain("data-invite-token");
    expect(body).toContain("tok-abc123");
    expect(body).toContain("/auth/invite/tok-abc123");
  });

  test("shows role error from form", () => {
    const { body } = render(Page, {
      props: { data: { members: MEMBERS }, form: { roleError: "Cannot change owner role" } },
    });
    expect(body).toContain("data-role-error");
    expect(body).toContain("Cannot change owner role");
  });

  test("shows remove error from form", () => {
    const { body } = render(Page, {
      props: { data: { members: MEMBERS }, form: { removeError: "Cannot remove last owner" } },
    });
    expect(body).toContain("data-remove-error");
    expect(body).toContain("Cannot remove last owner");
  });

  test("role dropdown shows all roles", () => {
    const { body } = render(Page, { props: { data: { members: MEMBERS } } });
    for (const role of ["owner", "admin", "member", "guest"]) {
      const count = (body.match(new RegExp(`value="${role}"`, "g")) ?? []).length;
      // At least 1 option per role per member's dropdown
      expect(count).toBeGreaterThan(0);
    }
  });

  test("members section form actions point to ?/updateRole and ?/remove", () => {
    const { body } = render(Page, { props: { data: { members: MEMBERS } } });
    expect(body).toContain("action=\"?/updateRole\"");
    expect(body).toContain("action=\"?/remove\"");
  });

  test("invite form action points to ?/invite", () => {
    const { body } = render(Page, { props: { data: { members: [] } } });
    expect(body).toContain("action=\"?/invite\"");
  });

  test("renders active login sessions and blocks current-session revoke", () => {
    const { body } = render(Page, {
      props: {
        data: {
          members: MEMBERS,
          sessions: [{
            id: "session-current",
            deviceType: "desktop",
            browser: "Firefox",
            ipAddress: "198.51.100.0",
            lastActiveAt: "2026-05-18T12:00:00.000Z",
            isCurrent: true,
          }, {
            id: "session-remote",
            deviceType: "mobile",
            browser: "Chrome",
            ipAddress: "203.0.113.0",
            lastActiveAt: "2026-05-18T13:00:00.000Z",
            isCurrent: false,
          }],
        },
      },
    });
    expect(body).toContain("data-auth-sessions-table");
    expect(body).toContain("data-revoke-current-blocked=\"session-current\"");
    expect(body).toContain("data-revoke-session=\"session-remote\"");
    expect(body).toContain("data-revoke-other-sessions");
  });
});
