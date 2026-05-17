import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { TaskViewRow } from "./task-view-types.ts";
import {
  buildBulkMutationRequest,
  nextTaskSelection,
  loadVisibleTaskColumns,
  saveVisibleTaskColumns,
  submitBulkTaskCustomFieldPatch,
  submitBulkTaskMutation,
} from "./task-table.ts";

type TaskTableProps = {
  tasks: TaskViewRow[];
  sort?: { column: string; direction: "asc" | "desc" };
  groupBy?: string | null;
  visibleColumns?: string[];
  locale?: string;
};

const TASKS: TaskViewRow[] = [
  {
    id: "task-late",
    title: "Late task",
    status: "blocked",
    priority: 3,
    project_id: "project-1",
    created_at: "2026-04-30T10:00:00.000Z",
    updated_at: "2026-04-30T10:00:00.000Z",
    assignee: "Maya",
    sprint_name: "Sprint 2",
    labels: ["api"],
    due_date: "2026-05-03",
  },
  {
    id: "task-early",
    title: "Early task",
    status: "pending",
    priority: 1,
    project_id: "project-1",
    created_at: "2026-04-28T10:00:00.000Z",
    updated_at: "2026-04-28T10:00:00.000Z",
    assignee: "Noah",
    sprint_name: "Sprint 1",
    labels: ["web"],
    due_date: "2026-05-04",
  },
  {
    id: "task-middle",
    title: "Middle task",
    status: "blocked",
    priority: 2,
    project_id: "project-1",
    created_at: "2026-04-29T10:00:00.000Z",
    updated_at: "2026-04-29T10:00:00.000Z",
    assignee: null,
    sprint_name: null,
    labels: ["ops"],
    due_date: null,
  },
];

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("TaskTable component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let TaskTable: Component<TaskTableProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./TaskTable.svelte")) as {
      default: Component<TaskTableProps>;
    };
    TaskTable = mod.default;
  });

  test("renders task columns with sortable headers", () => {
    const { body } = render(TaskTable, { props: { tasks: TASKS } });

    for (const col of ["title", "status", "assignee", "priority", "sprint", "labels", "created_at"]) {
      expect(body).toContain(`data-task-sort="${col}"`);
    }
  });

  test("sorts created_at ascending so earliest task renders first", () => {
    const { body } = render(TaskTable, {
      props: { tasks: TASKS, sort: { column: "created_at", direction: "asc" } },
    });

    const rows = body.match(/data-task-row[^>]*data-task-id="([^"]+)"/g) ?? [];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('data-task-id="task-early"');
    expect(rows[1]).toContain('data-task-id="task-middle"');
    expect(rows[2]).toContain('data-task-id="task-late"');
    expect(body).toMatch(/data-task-sort-direction[^>]*>\s*↑/);
  });

  test("groups rows by status with one group per unique status", () => {
    const { body } = render(TaskTable, {
      props: { tasks: TASKS, groupBy: "status" },
    });

    const groups = body.match(/data-task-group[^>]*data-group-key="([^"]+)"/g) ?? [];
    expect(groups).toHaveLength(2);
    expect(groups[0]).toContain('data-group-key="blocked"');
    expect(groups[1]).toContain('data-group-key="pending"');
    expect(body).toMatch(/data-task-group-count[^>]*>2</);
  });

  test("renders inline status editor with a responsibility-named intent", () => {
    const { body } = render(TaskTable, { props: { tasks: TASKS } });

    expect(body).toContain('data-inline-status="task-late"');
    expect(body).toContain('name="intent"');
    expect(body).toContain('value="update-task-status"');
    expect(body).toContain('name="status"');
  });

  test("respects persisted visible columns", () => {
    const localStorage = storage();
    saveVisibleTaskColumns(["title", "status"], localStorage);

    const { body } = render(TaskTable, {
      props: { tasks: TASKS, visibleColumns: loadVisibleTaskColumns(localStorage) ?? undefined },
    });

    expect(body).toContain('data-task-column="title"');
    expect(body).toContain('data-task-column="status"');
    expect(body).not.toContain('data-task-column="assignee"');
    expect(body).not.toContain('data-task-column="priority"');
  });

  test("formats due dates with active locale", () => {
    const { body } = render(TaskTable, {
      props: { tasks: TASKS, visibleColumns: ["title", "due_date"], locale: "ar" },
    });

    expect(body).toContain('data-task-column="due_date"');
    expect(body).toContain("مايو");
    expect(body).not.toContain("2026-05-03");
  });
});

describe("TaskTable bulk selection helpers", () => {
  test("cmd-click toggles individual task ids and shift-click selects contiguous range", () => {
    const orderedIds = TASKS.map((task) => task.id);
    let selection = nextTaskSelection({
      orderedIds,
      selectedIds: new Set(),
      clickedId: "task-late",
      anchorId: null,
      metaKey: true,
      shiftKey: false,
    });

    expect(selection.selectedIds).toEqual(new Set(["task-late"]));

    selection = nextTaskSelection({
      orderedIds,
      selectedIds: selection.selectedIds,
      clickedId: "task-middle",
      anchorId: selection.anchorId,
      metaKey: false,
      shiftKey: true,
    });

    expect([...selection.selectedIds]).toEqual(["task-late", "task-early", "task-middle"]);

    selection = nextTaskSelection({
      orderedIds,
      selectedIds: selection.selectedIds,
      clickedId: "task-early",
      anchorId: selection.anchorId,
      metaKey: true,
      shiftKey: false,
    });

    expect([...selection.selectedIds]).toEqual(["task-late", "task-middle"]);
  });

  test("buildBulkMutationRequest targets public task and sprint operations", () => {
    expect(
      buildBulkMutationRequest({
        action: "status",
        ids: ["task-a", "task-b"],
        value: "blocked",
      }),
    ).toEqual({
      kind: "update",
      input: { ids: ["task-a", "task-b"], patch: { status: "blocked" } },
    });

    expect(
      buildBulkMutationRequest({
        action: "assignee",
        ids: ["task-a", "task-b"],
        value: "user-1",
      }),
    ).toEqual({
      kind: "update",
      input: { ids: ["task-a", "task-b"], patch: { assigneeId: "user-1" } },
    });

    expect(
      buildBulkMutationRequest({
        action: "move",
        ids: ["task-a", "task-b"],
        value: { projectId: "project-1", sprintId: "sprint-1" },
      }),
    ).toEqual({
      kind: "assignSprint",
      input: { ids: ["task-a", "task-b"], sprintId: "sprint-1" },
    });

    expect(
      buildBulkMutationRequest({
        action: "sprint",
        ids: ["task-a", "task-b"],
        value: "sprint-2",
      }),
    ).toEqual({
      kind: "assignSprint",
      input: { ids: ["task-a", "task-b"], sprintId: "sprint-2" },
    });

    expect(buildBulkMutationRequest({ action: "delete", ids: ["task-a"], value: null })).toEqual({
      kind: "delete",
      input: { ids: ["task-a"] },
    });
  });

  test("submitBulkTaskMutation fans out to public task and sprint APIs", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await submitBulkTaskMutation(fetchFn, {
      kind: "update",
      input: { ids: ["task-a"], patch: { status: "done", priority: 3 } },
    }, { orgId: "org-1", userId: "user-1", projectId: "project-1" });
    await submitBulkTaskMutation(fetchFn, {
      kind: "assignSprint",
      input: { ids: ["task-a"], sprintId: "sprint-1" },
    }, { orgId: "org-1", userId: "user-1" });
    await submitBulkTaskMutation(fetchFn, {
      kind: "delete",
      input: { ids: ["task-a"] },
    }, { orgId: "org-1", userId: "user-1", projectId: "project-1" });

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ["PATCH", "/api/v1/tasks/task-a"],
      ["POST", "/api/v1/sprints/sprint-1/tasks"],
      ["DELETE", "/api/v1/tasks/task-a?orgId=org-1&userId=user-1&projectId=project-1"],
    ]);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      status: "done",
      priority: 3,
    });
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      orgId: "org-1",
      taskId: "task-a",
    });
  });

  test("submitBulkTaskCustomFieldPatch fans out public task custom field updates", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ taskId: "task-a", customFields: { severity: "critical" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await submitBulkTaskCustomFieldPatch(
      fetchFn,
      ["task-a", "task-b"],
      { "field-severity": "critical" },
      { orgId: "org-1", userId: "user-1", projectId: "project-1" },
    );

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ["POST", "/api/v1/task-custom-fields/set"],
      ["POST", "/api/v1/task-custom-fields/set"],
    ]);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-a",
      fieldId: "field-severity",
      value: "critical",
    });
  });
});
