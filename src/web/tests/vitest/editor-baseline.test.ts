import type { JSONContent } from "@tiptap/core";

const isVitestCli = process.argv.some((argument) => argument.includes("vitest"));

if (isVitestCli) {
  const { fireEvent, render, waitFor } = await import("@testing-library/svelte");
  const { describe, expect, test } = await import("vitest");
  const { default: EditorBaseline } = await import("../../src/lib/components/editor/EditorBaseline.svelte");

  const richContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Editor baseline" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Plain " },
          { type: "text", marks: [{ type: "bold" }], text: "bold" },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "List item" }],
              },
            ],
          },
        ],
      },
    ],
  };

  describe("EditorBaseline", () => {
    test("renders StarterKit JSON content", async () => {
      const { getByRole, getByText } = render(EditorBaseline, {
        props: { content: richContent },
      });

      await waitFor(() => {
        expect(getByRole("heading", { level: 2, name: "Editor baseline" })).toBeTruthy();
      });
      expect(getByText("bold").closest("strong")).toBeTruthy();
      expect(getByText("List item").closest("li")).toBeTruthy();
    });

    test("emits JSONContent change after paste mutation", async () => {
      const changes: JSONContent[] = [];
      const { container } = render(EditorBaseline, {
        props: {
          content: { type: "doc", content: [{ type: "paragraph" }] },
          onchange: (event: CustomEvent<JSONContent>) => changes.push(event.detail),
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
          getData: (type: string) => (type === "text/plain" ? "Hello" : ""),
          types: ["text/plain"],
        },
      });

      await waitFor(() => {
        expect(changes.at(-1)?.type).toBe("doc");
        expect(JSON.stringify(changes.at(-1))).toContain("Hello");
      });
    });

    test("empty content mounts as an empty document node", async () => {
      const changes: JSONContent[] = [];
      const { container } = render(EditorBaseline, {
        props: {
          content: { type: "doc" },
          onchange: (event: CustomEvent<JSONContent>) => changes.push(event.detail),
        },
      });

      await waitFor(() => {
        expect(container.querySelector(".ProseMirror")).toBeTruthy();
      });
      expect(container.querySelector(".ProseMirror")?.textContent).toBe("");
      expect(changes).toHaveLength(0);
    });
  });
}

export {};
