import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  applyNarrationToDoc,
  configureDocNarrator,
  parseNarrationFeature,
} from "../../src/docs/llm-narrator.ts";

type TipTapNode = { type?: string; attrs?: { readonly?: boolean; text?: string }; content?: TipTapNode[] };
type TipTapDoc = { type?: string; content?: TipTapNode[] };

const sourceContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Original body." }],
    },
  ],
};

describe("doc LLM narrator", () => {
  let previousFeatures: string | undefined;

  beforeEach(() => {
    previousFeatures = process.env["FULCRUM_FEATURES"];
  });

  afterEach(() => {
    if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = previousFeatures;
    configureDocNarrator({ client: null });
  });

  test("returns original doc without calling sidecar when report-llm-narration flag is OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const generate = mock(async () => ({ text: "one\n\ntwo", model: "test", tokens: 8 }));
    configureDocNarrator({ client: { generate } });

    const narrated = await applyNarrationToDoc({
      docType: "adr",
      bodyMd: "# Decision\n\nUse local defaults.",
      contentJson: sourceContent,
    });

    expect(narrated.changed).toBe(false);
    expect(narrated.bodyMd).toBe("# Decision\n\nUse local defaults.");
    expect(narrated.contentJson).toEqual(sourceContent);
    expect(generate).not.toHaveBeenCalled();
  });

  test("prepends and replaces one read-only narration block for eligible docs when flag is ON", async () => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
    const generate = mock(async () => ({
      text: "First executive paragraph.\n\nSecond executive paragraph.",
      model: "test",
      tokens: 12,
    }));
    configureDocNarrator({ client: { generate } });

    const first = await applyNarrationToDoc({
      docType: "adr",
      bodyMd: "# Decision\n\nUse local defaults.",
      contentJson: sourceContent,
    });

    expect(first.changed).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    const firstContent = first.contentJson as TipTapDoc;
    expect(firstContent.content?.[0]).toEqual({
      type: "narration-block",
      attrs: {
        readonly: true,
        text: "First executive paragraph.\n\nSecond executive paragraph.",
      },
    });
    expect(first.bodyMd).toStartWith(
      "> [AI Summary]\n>\n> First executive paragraph.\n>\n> Second executive paragraph.\n\n---\n\n",
    );

    generate.mockImplementation(async () => ({
      text: "Updated first paragraph.\n\nUpdated second paragraph.",
      model: "test",
      tokens: 12,
    }));

    const second = await applyNarrationToDoc({
      docType: "adr",
      bodyMd: first.bodyMd,
      contentJson: first.contentJson,
    });

    const secondContent = second.contentJson as TipTapDoc;
    const narrationBlocks = secondContent.content?.filter((node) => node.type === "narration-block") ?? [];
    expect(narrationBlocks).toHaveLength(1);
    expect(narrationBlocks[0]?.attrs?.text).toBe("Updated first paragraph.\n\nUpdated second paragraph.");
    expect(second.bodyMd).toStartWith(
      "> [AI Summary]\n>\n> Updated first paragraph.\n>\n> Updated second paragraph.\n\n---\n\n",
    );
    expect(second.bodyMd).not.toContain("First executive paragraph.");
  });

  test("skips non-eligible doc types even when flag is ON", async () => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
    const generate = mock(async () => ({ text: "one\n\ntwo", model: "test", tokens: 8 }));
    configureDocNarrator({ client: { generate } });

    const narrated = await applyNarrationToDoc({
      docType: "wiki",
      bodyMd: "# Wiki\n\nNo narration.",
      contentJson: sourceContent,
    });

    expect(narrated.changed).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  test("parses openai-compatible backend override", () => {
    process.env["FULCRUM_FEATURES"] = "embeddings,report-llm-narration:openai-compatible";
    expect(parseNarrationFeature()).toEqual({ backend: "openai-compatible" });
  });
});
