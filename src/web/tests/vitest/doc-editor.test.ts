import type { JSONContent } from "@tiptap/core";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import DocEditor from "../../src/lib/components/editor/DocEditor.svelte";

describe("DocEditor", () => {
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
    ]) {
      expect(getByLabelText(label)).toBeTruthy();
    }
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
