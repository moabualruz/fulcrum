import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listMemories } from "$lib/server/memory";

interface ProjectOption {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  title: string;
  status: string;
}

interface DocSlice {
  id: string;
  title: string;
  body_excerpt: string;
}

interface MemorySlice {
  id: string;
  key: string;
  body: string;
  scope: string;
}

interface RunSlice {
  id: string;
  agent: string;
  status: string;
  started_at: string;
}

interface ArtifactSlice {
  id: string;
  title: string;
  kind: string;
}

interface ContextBundle {
  memories: MemorySlice[];
  documents: DocSlice[];
  recentRuns: RunSlice[];
  artifacts: ArtifactSlice[];
  tokenBudget: { used: number; total: number };
}

function estimateTokens(text: string): number {
  // ~4 chars per token rough estimate
  return Math.ceil(text.length / 4);
}

export const load: PageServerLoad = ({ url, locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  const selectedProjectId = url.searchParams.get("projectId") || activeProjectId;
  const selectedTaskId = url.searchParams.get("taskId") || null;

  return {
    activeProjectId,
    selectedProjectId,
    selectedTaskId,
    streamed: {
      options: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const projects = await db.query<ProjectOption>(
            `SELECT id, name FROM projects WHERE org_id = $1 ORDER BY name ASC`,
            [orgId],
          );
          const tasks = selectedProjectId
            ? await db.query<TaskOption>(
                `SELECT id, title, status FROM tasks
                   WHERE org_id = $1 AND project_id = $2
                   ORDER BY updated_at DESC LIMIT 50`,
                [orgId, selectedProjectId],
              )
            : [];
          return { projects, tasks };
        } finally {
          await db.close();
        }
      })(),
      bundle: selectedTaskId
        ? (async (): Promise<ContextBundle> => {
            const db = await openProductDb();
            try {
              const orgId = await getDefaultOrgId(db);

              // Pane 1: Top-N memories
              const memories = (await listMemories(db, {
                orgId,
                projectId: selectedProjectId,
                limit: 20,
              })).map((m) => ({
                id: m.id,
                key: m.key,
                body: m.body,
                scope: m.scope,
              }));

              // Pane 2: Linked documents
              const documents = await db.query<DocSlice>(
                `SELECT d.id, d.title, substring(d.body, 1, 300) AS body_excerpt
                   FROM documents d
                   JOIN edges e ON e.from_kind = 'task' AND e.from_id = $1
                                AND e.to_kind = 'document' AND e.to_id = d.id
                  WHERE d.org_id = $2
                  ORDER BY d.updated_at DESC`,
                [selectedTaskId, orgId],
              );

              // Pane 3: Recent runs
              const recentRuns = (await db.query<{ id: string; agent: string; status: string; started_at: string | Date }>(
                `SELECT id, agent, status, started_at
                   FROM agent_runs
                  WHERE org_id = $1 AND ($2::text IS NULL OR project_id = $2)
                  ORDER BY started_at DESC LIMIT 10`,
                [orgId, selectedProjectId],
              )).map((r) => ({
                ...r,
                started_at: r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at,
              }));

              // Pane 4: Artifacts
              const artifacts = await db.query<ArtifactSlice>(
                `SELECT id, title, kind
                   FROM artifacts
                  WHERE task_id = $1 AND org_id = $2
                  ORDER BY created_at DESC`,
                [selectedTaskId, orgId],
              );

              // Token budget
              const TOTAL_BUDGET = 8000;
              const allText = [
                ...memories.map((m) => `${m.key}: ${m.body}`),
                ...documents.map((d) => `${d.title}: ${d.body_excerpt}`),
                ...recentRuns.map((r) => `${r.agent} ${r.status}`),
                ...artifacts.map((a) => `${a.kind}: ${a.title}`),
              ].join("\n");
              const used = estimateTokens(allText);

              return {
                memories,
                documents,
                recentRuns,
                artifacts,
                tokenBudget: { used: Math.min(used, TOTAL_BUDGET), total: TOTAL_BUDGET },
              };
            } finally {
              await db.close();
            }
          })()
        : null,
    },
  };
};
