/**
 * Convert Confluence storage format (XHTML) → markdown.
 * Uses rehype-parse → rehype-remark → remark-stringify pipeline.
 */
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";

export async function confluenceStorageToMarkdown(xhtml: string): Promise<string> {
  const file = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkStringify)
    .process(xhtml);
  return String(file).trim();
}
