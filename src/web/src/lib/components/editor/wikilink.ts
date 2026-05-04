import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

export const WIKILINK_INPUT_REGEX = /\[\[([^[\]\n]+)\]\]$/;

export const WikilinkNode = Node.create({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      slug: { default: "" },
      resolved: { default: false },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{
      tag: "a[data-wikilink-slug]",
      getAttrs: (element) => {
        if (!(element instanceof HTMLElement)) return false;
        return {
          slug: element.dataset.wikilinkSlug ?? "",
          resolved: element.dataset.wikilinkResolved === "true",
          title: element.dataset.wikilinkTitle ?? null,
        };
      },
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const slug = String(HTMLAttributes.slug ?? "");
    const resolved = HTMLAttributes.resolved === true || HTMLAttributes.resolved === "true";
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        href: `/docs/${slug}`,
        "data-wikilink-slug": slug,
        "data-wikilink-resolved": resolved ? "true" : "false",
        class: resolved ? "wikilink-chip wikilink-chip--resolved" : "wikilink-chip wikilink-chip--unresolved",
        title: resolved ? `Open ${slug}` : "create?",
      }),
      `[[${slug}]]`,
    ];
  },

  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;

          const replacements: { from: number; to: number; slug: string }[] = [];
          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;
            for (const match of node.text.matchAll(/\[\[([^[\]\n]+)\]\]/g)) {
              if (match.index === undefined) continue;
              const slug = String(match[1] ?? "").trim();
              if (!slug) continue;
              replacements.push({
                from: pos + match.index,
                to: pos + match.index + match[0].length,
                slug,
              });
            }
          });

          if (replacements.length === 0) return null;
          const tr = newState.tr;
          for (const replacement of replacements.reverse()) {
            tr.replaceWith(
              replacement.from,
              replacement.to,
              type.create({ slug: replacement.slug, resolved: false }),
            );
          }
          return tr;
        },
      }),
    ];
  },
});
