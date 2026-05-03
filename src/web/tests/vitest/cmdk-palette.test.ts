import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vitest";

import CommandPalette from "../../src/lib/components/command-palette/CommandPalette.svelte";
import type {
  CmdkCommand,
  CmdkSearchClient,
  CmdkSearchResult,
} from "../../src/lib/components/command-palette/cmdk-palette";

const SEARCH_RESULTS: CmdkSearchResult[] = [
  {
    id: "doc-1",
    kind: "doc",
    entityId: "doc-1",
    title: "Foo runbook",
    href: "/docs/doc-1",
    badge: "doc",
    breadcrumb: "Docs / Runbooks",
    updatedAt: "2026-05-03T09:00:00.000Z",
  },
  {
    id: "task-1",
    kind: "task",
    entityId: "task-1",
    title: "Foo task",
    href: "/tasks/task-1",
    badge: "task",
    breadcrumb: "Tasks",
    updatedAt: "2026-05-02T09:00:00.000Z",
  },
];

function searchClient(): CmdkSearchClient & { calls: Array<{ q: string; kind?: string }> } {
  const calls: Array<{ q: string; kind?: string }> = [];
  return {
    calls,
    async query(input) {
      calls.push({ q: input.q ?? "", kind: input.kind });
      return {
        results: SEARCH_RESULTS.filter((result) => input.kind === undefined || result.kind === input.kind),
        total: SEARCH_RESULTS.length,
        facetCounts: {
          kind: {},
          docType: {},
          status: {},
          assigneeId: {},
          repoId: {},
          authorId: {},
        },
      };
    },
  };
}

function commands(): CmdkCommand[] {
  return [
    { name: "open", label: "Open", handler: () => {} },
    { name: "create-task", label: "Create task", handler: () => {} },
  ];
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("CmdK palette web component", () => {
  test("Cmd+K opens and Escape closes", async () => {
    const client = searchClient();
    let open = false;

    const { queryByLabelText, rerender } = render(CommandPalette, {
      props: {
        open,
        onOpenChange: async (next: boolean) => {
          open = next;
          await rerender({ open });
        },
        searchClient: client,
        commands: commands(),
        onNavigate: () => {},
      },
    });

    expect(queryByLabelText("Search Fulcrum")).toBeNull();
    await fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(queryByLabelText("Search Fulcrum")).toBeTruthy();

    await fireEvent.keyDown(window, { key: "Escape" });
    expect(queryByLabelText("Search Fulcrum")).toBeNull();
  });

  test("debounces search, parses kind quick-filter, groups results, and caches repeat query", async () => {
    vi.useFakeTimers();
    const client = searchClient();

    const { getByLabelText, queryAllByText } = render(CommandPalette, {
      props: {
        open: true,
        onOpenChange: () => {},
        searchClient: client,
        commands: commands(),
        onNavigate: () => {},
      },
    });

    const input = getByLabelText("Search Fulcrum") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "kind:doc foo" } });
    await vi.advanceTimersByTimeAsync(149);
    expect(client.calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    await waitFor(() => expect(client.calls).toEqual([{ q: "foo", kind: "doc" }]));
    expect(queryAllByText("Docs")).toHaveLength(1);
    expect(queryAllByText("Foo runbook")).toHaveLength(1);
    expect(queryAllByText("Foo task")).toHaveLength(0);

    await fireEvent.input(input, { target: { value: "kind:doc foo " } });
    await vi.advanceTimersByTimeAsync(150);
    expect(client.calls).toHaveLength(1);
  });

  test("> prefix switches to command mode and >create-task dispatches task-create", async () => {
    const events: string[] = [];

    const { getByLabelText, getByText } = render(CommandPalette, {
      props: {
        open: true,
        onOpenChange: () => {},
        searchClient: searchClient(),
        commands: commands(),
        onNavigate: () => {},
        onTaskCreate: () => events.push("task-create"),
      },
    });

    await fireEvent.input(getByLabelText("Search Fulcrum"), { target: { value: ">create-task" } });

    expect(getByText("Commands")).toBeTruthy();
    await fireEvent.click(getByText("Create task"));
    expect(events).toEqual(["task-create"]);
  });

  test("Tab traps focus inside palette controls", async () => {
    const { getByLabelText, getByText } = render(CommandPalette, {
      props: {
        open: true,
        onOpenChange: () => {},
        searchClient: searchClient(),
        commands: [{ name: "open", label: "Open", handler: () => {} }],
        onNavigate: () => {},
      },
    });

    const input = getByLabelText("Search Fulcrum") as HTMLInputElement;
    input.focus();
    await fireEvent.input(input, { target: { value: ">" } });
    const button = getByText("Open").closest("button")!;

    await fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(button);

    await fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(input);
  });
});
