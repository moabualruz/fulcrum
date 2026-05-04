/**
 * Confluence sync job: fetch pages, convert to markdown, upsert docs rows.
 * Writes connector_sync_log row per run.
 */
import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";
import { isFeatureEnabled } from "../features.ts";
import type { ConfluencePage } from "./confluence-client.ts";
import { ConfluenceClient, ConfluenceApiError } from "./confluence-client.ts";
import { confluenceStorageToMarkdown } from "./confluence-converter.ts";

export interface SyncResult {
  logId: string;
  pagesSynced: number;
  errors: string[];
}

export interface ConfluenceSyncInput {
  orgId: string;
  spaceKey: string;
  /** Override client for testing */
  client?: ConfluenceClient;
}

function makeExternalId(pageId: string): string {
  return `confluence:${pageId}`;
}

export async function runConfluenceSync(
  db: ProductDb,
  input: ConfluenceSyncInput,
): Promise<SyncResult> {
  if (!isFeatureEnabled("connector-confluence")) {
    throw new Error("Feature connector-confluence is not enabled. Set FULCRUM_FEATURES=connector-confluence");
  }

  const logId = newUlid();
  await db.query(
    `INSERT INTO connector_sync_log (id, connector, org_id, started_at, status)
     VALUES ($1, 'confluence', $2, now(), 'running')`,
    [logId, input.orgId],
  );

  const errors: string[] = [];
  let pagesSynced = 0;

  try {
    const client = input.client ?? new ConfluenceClient({
      baseUrl: process.env.CONFLUENCE_BASE_URL ?? "",
      apiToken: process.env.CONFLUENCE_API_TOKEN ?? "",
      userEmail: process.env.CONFLUENCE_USER_EMAIL,
    });

    const pages = await client.fetchPages(input.spaceKey);

    for (const page of pages) {
      try {
        await upsertDocFromPage(db, input.orgId, page);
        pagesSynced++;
      } catch (err) {
        errors.push(`Page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    const msg = err instanceof ConfluenceApiError
      ? `API ${err.status}: ${err.body}`
      : err instanceof Error
        ? err.message
        : String(err);
    errors.push(msg);
  }

  await db.query(
    `UPDATE connector_sync_log
        SET finished_at = now(),
            status = $4,
            pages_synced = $2,
            errors_json = $3::jsonb
      WHERE id = $1`,
    [logId, pagesSynced, JSON.stringify(errors), errors.length === 0 ? "succeeded" : "failed"],
  );

  return { logId, pagesSynced, errors };
}

async function upsertDocFromPage(
  db: ProductDb,
  orgId: string,
  page: ConfluencePage,
): Promise<void> {
  const externalId = makeExternalId(page.id);
  const bodyMd = await confluenceStorageToMarkdown(page.body.storage.value);

  const existing = await db.query<{ id: string }>(
    `SELECT id FROM documents WHERE external_id = $1`,
    [externalId],
  );

  if (existing.length > 0) {
    await db.query(
      `UPDATE documents
          SET title = $2, body = $3, updated_at = now()
        WHERE external_id = $1`,
      [externalId, page.title, bodyMd],
    );
  } else {
    const id = newUlid();
    await db.query(
      `INSERT INTO documents (id, org_id, kind, title, body, external_id, doc_type, scope)
       VALUES ($1, $2, 'wiki', $3, $4, $5, 'wiki', 'global')`,
      [id, orgId, page.title, bodyMd, externalId],
    );
  }
}
