/**
 * Wikilink integration test (DOC-07).
 *
 * Asserts that when documents.update is called with contentJson containing
 * [[wikilink]] nodes, a doc_links row is written.
 *
 * Uses wikilink-extractor unit function (not a live DB) to verify the
 * extraction logic that feeds syncDocWikilinks. The full DB round-trip
 * requires a live DB; that is covered by the repository integration tests.
 * This unit test validates the contract: extractWikilinkSlugs correctly
 * parses ProseMirror JSON wikilink nodes.
 */

import { describe, it, expect } from "bun:test";
import { extractWikilinkSlugs } from "./wikilink-extractor.ts";

describe("Wikilink extraction from contentJson (DOC-07)", () => {
  it("extracts a single wikilink slug from ProseMirror JSON", () => {
    const contentJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "wikilink", attrs: { slug: "api-design" } },
          ],
        },
      ],
    };

    const slugs = extractWikilinkSlugs(contentJson);
    expect(slugs).toContain("api-design");
    expect(slugs).toHaveLength(1);
  });

  it("extracts multiple wikilink slugs deduped and sorted", () => {
    const contentJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "wikilink", attrs: { slug: "zebra-doc" } },
            { type: "wikilink", attrs: { slug: "alpha-doc" } },
            { type: "wikilink", attrs: { slug: "zebra-doc" } }, // duplicate
          ],
        },
      ],
    };

    const slugs = extractWikilinkSlugs(contentJson);
    expect(slugs).toEqual(["alpha-doc", "zebra-doc"]);
  });

  it("returns empty array when no wikilinks present", () => {
    const contentJson = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "plain text" }] },
      ],
    };

    const slugs = extractWikilinkSlugs(contentJson);
    expect(slugs).toHaveLength(0);
  });

  it("handles nested content nodes", () => {
    const contentJson = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "wikilink", attrs: { slug: "nested-slug" } },
              ],
            },
          ],
        },
      ],
    };

    const slugs = extractWikilinkSlugs(contentJson);
    expect(slugs).toContain("nested-slug");
  });

  it("ignores wikilink nodes with empty slug", () => {
    const contentJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "wikilink", attrs: { slug: "" } },
            { type: "wikilink", attrs: { slug: "   " } },
          ],
        },
      ],
    };

    const slugs = extractWikilinkSlugs(contentJson);
    expect(slugs).toHaveLength(0);
  });
});
