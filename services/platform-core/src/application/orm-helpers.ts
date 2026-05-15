import { randomUUID } from "node:crypto";

type QueryExecutor = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
};

type ConnectionExecutor = {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

type ConnectionManager = {
  getConnection(): ConnectionExecutor;
};

type SqlManager = QueryExecutor | ConnectionManager;

export function ormSqlConnection(manager: SqlManager) {
  if (!hasConnection(manager)) {
    return {
      execute<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T> {
        return manager.query(sql, params) as Promise<T>;
      },
    };
  }
  const conn = manager.getConnection();
  return {
    execute<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T> {
      const normalized = normalizeSqlParams(sql, params);
      return conn.execute(normalized.sql, normalized.params) as Promise<T>;
    },
  };
}

function hasConnection(manager: SqlManager): manager is ConnectionManager {
  return typeof (manager as { getConnection?: unknown }).getConnection === "function";
}

export function normalizeSqlParams(
  sql: string,
  params: readonly unknown[] = [],
): { sql: string; params: unknown[] } {
  const normalizedParams: unknown[] = [];
  const normalizedSql = sql.replace(/\$(\d+)/g, (_match, index: string) => {
    normalizedParams.push(params[Number(index) - 1]);
    return "?";
  });
  return {
    sql: normalizedSql,
    params: normalizedParams.length > 0 ? normalizedParams : [...params],
  };
}

export interface AppendEventInput {
  orgId: string;
  projectId?: string | null;
  actor: string;
  subjectKind: string;
  subjectId: string;
  verb: string;
  payload?: Record<string, unknown>;
}

export async function appendEventOrm(
  em: SqlManager,
  input: AppendEventInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  await ormSqlConnection(em).execute(
    `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CAST($8 AS jsonb))`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.actor,
      input.subjectKind,
      input.subjectId,
      input.verb,
      JSON.stringify({ actor: input.actor, ...(input.payload ?? {}) }),
    ],
  );
  return { id };
}

export interface IndexSearchInput {
  orgId: string;
  projectId?: string | null;
  sourceKind: string;
  sourceId: string;
  title: string;
  body: string;
  labels?: string[];
}

export async function indexSearchDocumentOrm(
  em: SqlManager,
  input: IndexSearchInput,
): Promise<void> {
  const id = randomUUID();
  const conn = ormSqlConnection(em);
  const columns = await tableColumns(em, "search_documents");
  const kindColumn = columns.has("source_kind") ? "source_kind" : "entity_kind";
  const idColumn = columns.has("source_id") ? "source_id" : "entity_id";
  const existing = await conn.execute<Array<{ id: string }>>(
    `SELECT id
       FROM search_documents
      WHERE org_id = $1
        AND ${kindColumn} = $2
        AND ${idColumn} = $3
      LIMIT 1`,
    [input.orgId, input.sourceKind, input.sourceId],
  );
  const candidateValues: Array<[string, unknown]> = [
    ["title", input.title],
    ["body", input.body],
    ["labels", input.labels ?? []],
    ["updated_at", new Date()],
    ["project_id", input.projectId ?? null],
  ];
  const values = candidateValues.filter(([column]) => columns.has(column));
  if (existing[0]) {
    const assignments = values.map(([column], index) => `${column} = $${index + 2}`).join(", ");
    await conn.execute(
      `UPDATE search_documents SET ${assignments} WHERE id = $1`,
      [existing[0].id, ...values.map(([, value]) => value)],
    );
    return;
  }
  const insertValues: Array<[string, unknown]> = [
    ["id", id],
    ["org_id", input.orgId],
    [kindColumn, input.sourceKind],
    [idColumn, input.sourceId],
    ...values,
  ];
  if (columns.has("entity_kind") && kindColumn !== "entity_kind") insertValues.push(["entity_kind", input.sourceKind]);
  if (columns.has("entity_id") && idColumn !== "entity_id") insertValues.push(["entity_id", input.sourceId]);
  if (columns.has("source_kind") && kindColumn !== "source_kind") insertValues.push(["source_kind", input.sourceKind]);
  if (columns.has("source_id") && idColumn !== "source_id") insertValues.push(["source_id", input.sourceId]);
  await conn.execute(
    `INSERT INTO search_documents (${insertValues.map(([column]) => column).join(", ")})
     VALUES (${insertValues.map((_, index) => `$${index + 1}`).join(", ")})`,
    insertValues.map(([, value]) => value),
  );
}

async function tableColumns(em: SqlManager, tableName: string): Promise<Set<string>> {
  const rows = await ormSqlConnection(em).execute<Array<{ column_name: string }>>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName],
  );
  return new Set(rows.map((row) => row.column_name));
}

export interface EnqueueJobInput {
  orgId: string;
  projectId?: string | null;
  queue: string;
  kind: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  availableAt?: Date;
}

export async function enqueueJobOrm(
  em: SqlManager,
  input: EnqueueJobInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  await ormSqlConnection(em).execute(
    `INSERT INTO jobs (id, org_id, project_id, queue, kind, payload, status, max_attempts, available_at)
     VALUES ($1, $2, $3, $4, $5, CAST($6 AS jsonb), 'queued', $7, $8)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.queue,
      input.kind,
      JSON.stringify(input.payload ?? {}),
      input.maxAttempts ?? 3,
      input.availableAt ?? new Date(),
    ],
  );
  return { id };
}
