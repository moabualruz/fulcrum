import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vitest";
import CommentsPanel from "../../src/lib/components/editor/CommentsPanel.svelte";

const openThreads = [
  {
    id: "c2",
    bodyMd: "Second thread",
    anchorRange: { from: 20, to: 25, text_preview: "later" },
    resolved: false,
    replies: [],
  },
  {
    id: "c1",
    bodyMd: "First thread",
    anchorRange: { from: 2, to: 7, text_preview: "early" },
    resolved: false,
    replies: [{ id: "r1", bodyMd: "Nested reply", resolved: false }],
  },
];

describe("CommentsPanel", () => {
  afterEach(cleanup);

  test("lists open threads by anchor position and nests replies", () => {
    const { getAllByTestId, getByText } = render(CommentsPanel, {
      props: { threads: openThreads, resolvedThreads: [], readonly: false },
    });

    expect(getAllByTestId("comment-thread").map((node) => node.textContent)).toEqual([
      expect.stringContaining("First thread"),
      expect.stringContaining("Second thread"),
    ]);
    expect(getByText("Nested reply")).toBeTruthy();
  });

  test("hover, reply, resolve, and reopen emit thread events", async () => {
    const highlight = vi.fn();
    const reply = vi.fn();
    const resolve = vi.fn();
    const reopen = vi.fn();
    const { getByLabelText, getByTestId } = render(CommentsPanel, {
      props: {
        threads: openThreads.slice(0, 1),
        resolvedThreads: [{ ...openThreads[1], resolved: true }],
        readonly: false,
        onhighlight: (event: CustomEvent) => highlight(event.detail),
        onreply: (event: CustomEvent) => reply(event.detail),
        onresolve: (event: CustomEvent) => resolve(event.detail),
        onreopen: (event: CustomEvent) => reopen(event.detail),
      },
    });

    await fireEvent.mouseEnter(getByTestId("comment-thread"));
    expect(highlight).toHaveBeenCalledWith({ id: "c2", anchorRange: { from: 20, to: 25, text_preview: "later" } });

    await fireEvent.input(getByLabelText("Reply to Second thread"), { target: { value: "Reply body" } });
    await fireEvent.click(getByLabelText("Send reply to Second thread"));
    expect(reply).toHaveBeenCalledWith({ parentCommentId: "c2", bodyMd: "Reply body" });

    await fireEvent.click(getByLabelText("Resolve Second thread"));
    expect(resolve).toHaveBeenCalledWith({ id: "c2" });

    await fireEvent.click(getByLabelText("Show resolved threads"));
    await fireEvent.click(getByLabelText("Re-open First thread"));
    expect(reopen).toHaveBeenCalledWith({ id: "c1" });
  });

  test("read-only mode hides anchoring and reply controls", () => {
    const { queryByLabelText, getByTestId } = render(CommentsPanel, {
      props: { threads: openThreads.slice(0, 1), resolvedThreads: [], readonly: true },
    });

    expect(getByTestId("comments-panel").getAttribute("data-readonly")).toBe("true");
    expect(queryByLabelText("Reply to Second thread")).toBeNull();
    expect(queryByLabelText("Resolve Second thread")).toBeNull();
  });
});
