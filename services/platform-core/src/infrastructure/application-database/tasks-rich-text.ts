export interface TipTapJson {
  type?: string;
  text?: string;
  content?: TipTapJson[];
  [key: string]: unknown;
}

export const emptyTipTapDoc: TipTapJson = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function textToTipTapDoc(text: string): TipTapJson {
  return {
    type: "doc",
    content: text.split(/\r?\n/).map((paragraph) => ({
      type: "paragraph",
      content: paragraph.length > 0 ? [{ type: "text", text: paragraph }] : undefined,
    })),
  };
}

export function tipTapDocToText(doc: TipTapJson | null | undefined): string {
  if (!doc) return "";
  const parts: string[] = [];
  function visit(node: TipTapJson): void {
    if (typeof node.text === "string") parts.push(node.text);
    for (const child of node.content ?? []) visit(child);
    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") {
      parts.push("\n");
    }
  }
  visit(doc);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}
