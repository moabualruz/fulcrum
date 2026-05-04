import type { JSONContent } from "@tiptap/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vitest";
import DocEditor from "../../src/lib/components/editor/DocEditor.svelte";

describe("DocEditor", () => {
  afterEach(cleanup);

  test("renders core mark and block toolbar controls", async () => {
    const { getByLabelText } = render(DocEditor, {
      props: { content: { type: "doc", content: [{ type: "paragraph" }] } },
    });

    await waitFor(() => expect(getByLabelText("Bold")).toBeTruthy());
    for (const label of [
      "Italic",
      "Strike",
      "Underline",
      "Inline code",
      "Heading 1",
      "Heading 2",
      "Bullet list",
      "Numbered list",
      "Task list",
      "Quote",
      "Code block",
      "Table",
      "Unlink",
      "Comment",
    ]) {
      expect(getByLabelText(label)).toBeTruthy();
    }
  });

  test("comment button emits current selection anchor", async () => {
    const comments: Array<{ anchorRange: { from: number; to: number; text_preview: string } }> = [];
    const { container, getByLabelText } = render(DocEditor, {
      props: {
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha beta" }] }] },
        oncomment: (event: CustomEvent<{ anchorRange: { from: number; to: number; text_preview: string } }>) => {
          comments.push(event.detail);
        },
      },
    });

    const editable = await waitFor(() => {
      const element = container.querySelector("[data-doc-editor-input]");
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });
    editable.focus();
    const selection = window.getSelection();
    const textNode = editable.querySelector("p")?.firstChild;
    expect(textNode).toBeTruthy();
    const range = document.createRange();
    range.setStart(textNode!, 6);
    range.setEnd(textNode!, 10);
    selection?.removeAllRanges();
    selection?.addRange(range);

    await fireEvent.click(getByLabelText("Comment"));

    expect(comments.at(-1)?.anchorRange.text_preview).toBe("beta");
    expect(comments.at(-1)?.anchorRange.from).toBeLessThan(comments.at(-1)?.anchorRange.to ?? 0);
  });

  test("slash menu filters typed command and inserts selected block", async () => {
    const changes: { contentJson: JSONContent; bodyMd: string }[] = [];
    const { container, findByRole } = render(DocEditor, {
      props: {
        content: { type: "doc", content: [{ type: "paragraph" }] },
        onchange: (event: CustomEvent<{ contentJson: JSONContent; bodyMd: string }>) => changes.push(event.detail),
      },
    });

    const editable = await waitFor(() => {
      const element = container.querySelector("[data-doc-editor-input]");
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });

    editable.focus();
    await fireEvent.input(editable, { inputType: "insertText", data: "/", target: { textContent: "/" } });
    await fireEvent.keyDown(editable, { key: "/" });
    await fireEvent.paste(editable, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "/heading-2" : ""),
        types: ["text/plain"],
      },
    });

    const option = await findByRole("option", { name: "Heading 2" });
    await fireEvent.click(option);

    await waitFor(() => {
      expect(JSON.stringify(changes.at(-1)?.contentJson)).toContain("\"heading\"");
      expect(JSON.stringify(changes.at(-1)?.contentJson)).toContain("\"level\":2");
    });
  });

  test("autosave waits 2s and saves latest JSON once", async () => {
    vi.useFakeTimers();
    const saves: { contentJson: JSONContent; bodyMd: string }[] = [];
    const { container } = render(DocEditor, {
      props: {
        content: { type: "doc", content: [{ type: "paragraph" }] },
        save: (contentJson: JSONContent, bodyMd: string) => {
          saves.push({ contentJson, bodyMd });
        },
      },
    });

    const editable = await waitFor(() => {
      const element = container.querySelector("[data-doc-editor-input]");
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });

    editable.focus();
    await fireEvent.paste(editable, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Autosave" : ""),
        types: ["text/plain"],
      },
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(saves).toHaveLength(1);
    expect(JSON.stringify(saves[0]?.contentJson)).toContain("Autosave");
    vi.useRealTimers();
  });
});
