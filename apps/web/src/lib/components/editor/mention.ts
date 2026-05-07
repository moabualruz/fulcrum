import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

export const MENTION_INPUT_REGEX = /@(user|team):([A-Za-z0-9._-]+)$/;
const MENTION_SCAN_REGEX = /@(user|team):([A-Za-z0-9._-]+)/g;

export type MentionKind = "user" | "team";

export const MentionNode = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: "user" },
      id: { default: "" },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [{
      tag: "span[data-mention-kind][data-mention-id]",
      getAttrs: (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const kind = element.dataset.mentionKind;
        if (kind !== "user" && kind !== "team") return false;
        const id = element.dataset.mentionId ?? "";
        return {
          kind,
          id,
          label: element.dataset.mentionLabel ?? element.textContent ?? `@${id}`,
        };
      },
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const kind = normalizeMentionKind(HTMLAttributes.kind);
    const id = String(HTMLAttributes.id ?? "");
    const label = String(HTMLAttributes.label || `@${id}`);

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention-kind": kind,
        "data-mention-id": id,
        "data-mention-label": label,
        class: `mention-chip mention-chip--${kind}`,
        contenteditable: "false",
        title: kind === "team" ? `Team ${label}` : `User ${label}`,
      }),
      label,
    ];
  },

  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;

          const replacements: { from: number; to: number; kind: MentionKind; id: string }[] = [];
          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;
            for (const match of node.text.matchAll(MENTION_SCAN_REGEX)) {
              if (match.index === undefined) continue;
              const kind = match[1] as MentionKind;
              const id = String(match[2] ?? "").trim();
              if (!id) continue;
              replacements.push({
                from: pos + match.index,
                to: pos + match.index + match[0].length,
                kind,
                id,
              });
            }
          });

          if (replacements.length === 0) return null;
          const tr = newState.tr;
          for (const replacement of replacements.reverse()) {
            tr.replaceWith(
              replacement.from,
              replacement.to,
              type.create({
                kind: replacement.kind,
                id: replacement.id,
                label: `@${replacement.id}`,
              }),
            );
          }
          return tr;
        },
      }),
    ];
  },
});

function normalizeMentionKind(kind: unknown): MentionKind {
  return kind === "team" ? "team" : "user";
}
