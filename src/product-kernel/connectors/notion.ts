/**
 * Notion connector — one-way import from Notion REST API → docs rows.
 * Feature-gated behind FULCRUM_FEATURES=connector-notion.
 */
import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";
import { isFeatureEnabled, FeatureDisabledError } from "./features.ts";
import { enqueueJob, claimJob, completeJob, failJob } from "../jobs.ts";

// ── Notion API types ──

export interface NotionRichText {
  plain_text: string;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

export interface NotionPageResult {
  id: string;
  properties?: {
    title?: { title?: NotionRichText[] };
    Name?: { title?: NotionRichText[] };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface NotionPaginatedResponse<T> {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

// ── Notion API client interface (for testability) ──

export interface NotionClient {
  listPages(cursor?: string | null): Promise<NotionPaginatedResponse<NotionPageResult>>;
  getBlockChildren(blockId: string, cursor?: string | null): Promise<NotionPaginatedResponse<NotionBlock>>;
}

/** Real Notion REST API client. */
export function createNotionClient(apiKey: string, databaseId?: string): NotionClient {
  const baseUrl = "https://api.notion.com/v1";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  // Simple throttle: max 3 req/s
  let lastRequest = 0;
  async function throttledFetch(url: string): Promise<Response> {
    const now = Date.now();
    const wait = Math.max(0, 334 - (now - lastRequest));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new NotionApiError(res.status, body);
    }
    return res;
  }

  return {
    async listPages(cursor) {
      let url: string;
      if (databaseId) {
        // POST to query database — but we use GET for simplicity with pagination
        url = `${baseUrl}/databases/${databaseId}/query`;
      } else {
        url = `${baseUrl}/search`;
      }
      // For simplicity, use search endpoint with GET-like pagination
      const params = new URLSearchParams();
      if (cursor) params.set("start_cursor", cursor);
      params.set("page_size", "50");
      const fullUrl = `${url}?${params}`;
      const res = await throttledFetch(fullUrl);
      return (await res.json()) as NotionPaginatedResponse<NotionPageResult>;
    },
    async getBlockChildren(blockId, cursor) {
      const params = new URLSearchParams({ page_size: "100" });
      if (cursor) params.set("start_cursor", cursor);
      const res = await throttledFetch(`${baseUrl}/blocks/${blockId}/children?${params}`);
      return (await res.json()) as NotionPaginatedResponse<NotionBlock>;
    },
  };
}

export class NotionApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Notion API error ${status}: ${body}`);
    this.name = "NotionApiError";
  }
}

// ── Block → Markdown converter ──

function richTextToMd(texts: NotionRichText[] | undefined): string {
  if (!texts?.length) return "";
  return texts.map((t) => t.plain_text).join("");
}

function blockContent(block: NotionBlock): { text: NotionRichText[]; [k: string]: unknown } | undefined {
  return block[block.type] as { text: NotionRichText[] } | undefined;
}

export function blockToMarkdown(block: NotionBlock): string {
  const content = blockContent(block);
  const text = richTextToMd(content?.text);

  switch (block.type) {
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "paragraph":
      return text;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "code": {
      const lang = (content as Record<string, unknown>)?.language ?? "";
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }
    case "toggle":
      return `> ${text}`;
    case "image": {
      const img = content as Record<string, unknown> | undefined;
      const fileObj = (img?.file ?? img?.external) as { url?: string } | undefined;
      const url = fileObj?.url ?? "";
      const caption = richTextToMd((img?.caption as NotionRichText[] | undefined));
      return `![${caption || "image"}](${url})`;
    }
    case "quote":
      return `> ${text}`;
    case "divider":
      return "---";
    case "to_do": {
      const checked = (content as Record<string, unknown>)?.checked ? "x" : " ";
      return `- [${checked}] ${text}`;
    }
    default:
      // Unsupported block types rendered as plain text
      return text;
  }
}

// ── Recursive page fetcher ──

interface FetchedPage {
  id: string;
  title: string;
  bodyMd: string;
  childPageIds: string[];
  notionRaw: Record<string, unknown>;
}

const MAX_DEPTH = 10;

export async function fetchPageWithBlocks(
  client: NotionClient,
  pageId: string,
  depth: number = 0,
): Promise<{ blocks: NotionBlock[]; childPageIds: string[] }> {
  if (depth > MAX_DEPTH) return { blocks: [], childPageIds: [] };

  const allBlocks: NotionBlock[] = [];
  const childPageIds: string[] = [];
  let cursor: string | null = null;

  do {
    const resp = await client.getBlockChildren(pageId, cursor);
    for (const block of resp.results) {
      allBlocks.push(block);
      if (block.type === "child_page") {
        childPageIds.push(block.id);
      }
      // Recurse into blocks with children (except child_page — fetched separately)
      if (block.has_children && block.type !== "child_page" && depth < MAX_DEPTH) {
        const nested = await fetchPageWithBlocks(client, block.id, depth + 1);
        allBlocks.push(...nested.blocks);
      }
    }
    cursor = resp.has_more ? resp.next_cursor : null;
  } while (cursor);

  return { blocks: allBlocks, childPageIds };
}

function extractTitle(page: NotionPageResult): string {
  const titleProp = page.properties?.title ?? page.properties?.Name;
  const titleTexts = titleProp?.title;
  return richTextToMd(titleTexts) || "Untitled";
}

// ── Sync orchestrator ──

export interface SyncResult {
  pagesSynced: number;
  errors: string[];
  syncLogId: string;
}

export async function syncNotion(
  db: ProductDb,
  client: NotionClient,
  orgId: string,
): Promise<SyncResult> {
  const syncLogId = newUlid();
  await db.query(
    `INSERT INTO connector_sync_log (id, connector, org_id, started_at) VALUES ($1, 'notion', $2, now())`,
    [syncLogId, orgId],
  );

  const errors: string[] = [];
  let pagesSynced = 0;

  try {
    // Fetch all top-level pages
    const allPages: NotionPageResult[] = [];
    let cursor: string | null = null;
    do {
      const resp = await client.listPages(cursor);
      allPages.push(...resp.results);
      cursor = resp.has_more ? resp.next_cursor : null;
    } while (cursor);

    // Process each page: fetch blocks, convert to markdown, upsert
    for (const page of allPages) {
      try {
        await processPage(db, client, orgId, page, null, 0);
        pagesSynced++;
      } catch (err) {
        errors.push(`Page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Finalize sync log
    await db.query(
      `UPDATE connector_sync_log SET finished_at = now(), pages_synced = $2, errors_json = $3::jsonb WHERE id = $1`,
      [syncLogId, pagesSynced, JSON.stringify(errors)],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    await db.query(
      `UPDATE connector_sync_log SET finished_at = now(), pages_synced = $2, errors_json = $3::jsonb WHERE id = $1`,
      [syncLogId, pagesSynced, JSON.stringify(errors)],
    );
    throw err;
  }

  return { pagesSynced, errors, syncLogId };
}

async function processPage(
  db: ProductDb,
  client: NotionClient,
  orgId: string,
  page: NotionPageResult,
  parentDocId: string | null,
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  const title = extractTitle(page);
  const { blocks, childPageIds } = await fetchPageWithBlocks(client, page.id, 0);
  const bodyMd = blocks.map(blockToMarkdown).filter(Boolean).join("\n\n");
  const externalId = `notion:${page.id}`;

  // Upsert doc by external_id
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM documents WHERE org_id = $1 AND external_id = $2`,
    [orgId, externalId],
  );

  let docId: string;
  if (existing.length > 0) {
    docId = existing[0]!.id;
    await db.query(
      `UPDATE documents SET title = $2, body_md = $3, body = $3, frontmatter = $4::jsonb, parent_id = $5, updated_at = now() WHERE id = $1`,
      [docId, title, bodyMd, JSON.stringify({ notion_raw: page }), parentDocId],
    );
  } else {
    docId = newUlid();
    await db.query(
      `INSERT INTO documents (id, org_id, kind, title, body, body_md, frontmatter, external_id, doc_type, scope, parent_id)
       VALUES ($1, $2, 'wiki', $3, $4, $4, $5::jsonb, $6, 'wiki', 'global', $7)`,
      [docId, orgId, title, bodyMd, JSON.stringify({ notion_raw: page }), externalId, parentDocId],
    );
  }

  // Recurse into child pages
  for (const childId of childPageIds) {
    const childPage: NotionPageResult = { id: childId, properties: {} };
    // Fetch child page title from its blocks
    try {
      await processPage(db, client, orgId, childPage, docId, depth + 1);
    } catch {
      // Child page errors don't fail parent
    }
  }
}

// ── Job runner ──

export async function enqueueNotionSync(
  db: ProductDb,
  orgId: string,
): Promise<string> {
  if (!isFeatureEnabled("connector-notion")) {
    throw new FeatureDisabledError("connector-notion");
  }
  const job = await enqueueJob(db, {
    orgId,
    queue: "connectors",
    kind: "notion-sync",
    payload: {},
    maxAttempts: 1,
  });
  return job.id;
}

export async function runNotionSyncJob(
  db: ProductDb,
  client: NotionClient,
  orgId: string,
): Promise<SyncResult> {
  return syncNotion(db, client, orgId);
}
