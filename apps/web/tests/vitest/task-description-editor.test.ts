import type { JSONContent } from "@tiptap/core";

const isVitestCli = process.env["VITEST"] === "true" || process.env["VITEST_WORKER_ID"] !== undefined;

const emptyDoc: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

if (isVitestCli) {
  const { fireEvent, render, waitFor } = await import("@testing-library/svelte");
  const { afterEach, describe, expect, test, vi } = await import("vitest");
  const { default: TaskDescriptionEditor } = await import("../../src/lib/components/tasks/TaskDescriptionEditor.svelte");

  describe("TaskDescriptionEditor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("autosaves exactly once 1500 ms after the last edit", async () => {
    vi.useFakeTimers();
    const saves: JSONContent[] = [];
    const { container } = render(TaskDescriptionEditor, {
      props: {
        taskId: "task-1",
        content: emptyDoc,
        save: async (_taskId: string, content: JSONContent) => {
          saves.push(content);
        },
      },
    });

    const editable = await waitFor(() => {
      const element = container.querySelector(".ProseMirror");
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });

    editable.focus();
    await fireEvent.paste(editable, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "first" : ""),
        types: ["text/plain"],
      },
    });
    await vi.advanceTimersByTimeAsync(1000);
    await fireEvent.paste(editable, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? " second" : ""),
        types: ["text/plain"],
      },
    });

    await vi.advanceTimersByTimeAsync(1499);
    expect(saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(saves).toHaveLength(1);
    expect(JSON.stringify(saves[0])).toContain("second");
  });

  test("renders missing wikilinks with dashed underline without throwing", async () => {
    const { container, getByText } = render(TaskDescriptionEditor, {
      props: {
        taskId: "task-1",
        content: {
          type: "doc",
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: "Read [[missing-slug]]" }],
          }],
        },
        resolveDoc: async () => null,
      },
    });

    const wikilink = await waitFor(() => getByText("[[missing-slug]]"));
    expect(wikilink.getAttribute("data-wikilink-status")).toBe("missing");
  });

  test("emits mention_created with task id and selected target", async () => {
    const mentions: unknown[] = [];
    const { getByRole, getByText } = render(TaskDescriptionEditor, {
      props: {
        taskId: "task-1",
        content: {
          type: "doc",
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: "Assign @agent-alpha" }],
          }],
        },
        mentionTargets: [{ id: "agent-1", label: "agent-alpha", kind: "agent" }],
        onmention_created: (event: CustomEvent) => mentions.push(event.detail),
      },
    });

    await waitFor(() => expect(getByText("agent-alpha")).toBeTruthy());
    await fireEvent.click(getByRole("button", { name: "agent-alpha" }));

    expect(mentions).toEqual([{
      task_id: "task-1",
      mentioned_id: "agent-1",
      kind: "agent",
    }]);
  });
  });
}

export {};
