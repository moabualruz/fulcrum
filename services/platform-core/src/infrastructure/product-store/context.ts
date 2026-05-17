import type { ProductDb } from "./db/types.ts";
import { searchProductDocuments } from "./search.ts";

export interface ContextSection {
  heading: string;
  body: string;
}

export interface AssembleContextInput {
  orgId: string;
  taskId: string;
  searchQuery?: string | null;
  limit?: number;
}

interface TaskSnapshot {
  id: string;
  title: string;
  description: string | null;
  status: string;
  project_id: string | null;
}

interface DocSnapshot {
  id: string;
  title: string;
  body: string;
  updated_at: string;
}

interface MemorySnapshot {
  id: string;
  key: string;
  body: string;
  updated_at: string;
}

interface ArtifactSnapshot {
  id: string;
  title: string;
  kind: string;
  created_at: string;
}

export async function assembleContext(
  db: ProductDb,
  input: AssembleContextInput,
): Promise<string> {
  const sections: ContextSection[] = [];
  const taskRows = await db.query<TaskSnapshot>(
    `SELECT id, title, description, status, project_id FROM tasks WHERE id = $1 AND org_id = $2`,
    [input.taskId, input.orgId],
  );
  const task = taskRows[0];
  if (!task) {
    sections.push({ heading: "Task", body: "_unknown task_" });
    return renderContext(sections);
  }
  sections.push({
    heading: "Task",
    body: `**${task.title}** (${task.status})\n\n${task.description ?? ""}`.trim(),
  });

  const docs = await db.query<DocSnapshot>(
    `SELECT d.id, d.title, d.body, d.updated_at
       FROM documents d
       JOIN edges e ON e.from_kind = 'task' AND e.from_id = $1
                    AND e.to_kind = 'document' AND e.to_id = d.id
      WHERE d.org_id = $2
      ORDER BY d.updated_at DESC, d.id ASC`,
    [input.taskId, input.orgId],
  );
  if (docs.length > 0) {
    sections.push({
      heading: "Documents",
      body: docs.map((d) => `- ${d.title} (${d.id})`).join("\n"),
    });
  }

  const memories = await db.query<MemorySnapshot>(
    `SELECT m.id, m.key, m.body, m.updated_at
       FROM memories m
       JOIN edges e ON e.from_kind = 'task' AND e.from_id = $1
                    AND e.to_kind = 'memory' AND e.to_id = m.id
      WHERE m.org_id = $2
      ORDER BY m.updated_at DESC, m.id ASC`,
    [input.taskId, input.orgId],
  );
  if (memories.length > 0) {
    sections.push({
      heading: "Memory",
      body: memories.map((m) => `- ${m.key}: ${m.body}`).join("\n"),
    });
  }

  if (input.searchQuery) {
    const hits = await searchProductDocuments(db, input.searchQuery, {
      orgId: input.orgId,
      projectId: task.project_id,
      limit: input.limit ?? 5,
    });
    if (hits.length > 0) {
      sections.push({
        heading: "Search hits",
        body: hits.map((h) => `- [${h.source_kind}:${h.source_id}] ${h.title}`).join("\n"),
      });
    }
  }

  const decisions = await db.query<DocSnapshot>(
    `SELECT id, title, body, updated_at
       FROM documents
      WHERE org_id = $1 AND kind = 'decision'
      ORDER BY updated_at DESC, id ASC
      LIMIT 5`,
    [input.orgId],
  );
  if (decisions.length > 0) {
    sections.push({
      heading: "Recent decisions",
      body: decisions.map((d) => `- ${d.title}`).join("\n"),
    });
  }

  const artifacts = await db.query<ArtifactSnapshot>(
    `SELECT id, title, kind, created_at
       FROM artifacts
      WHERE task_id = $1 AND org_id = $2
      ORDER BY created_at DESC, id ASC`,
    [input.taskId, input.orgId],
  );
  if (artifacts.length > 0) {
    sections.push({
      heading: "Artifacts",
      body: artifacts.map((a) => `- ${a.kind}: ${a.title} (${a.id})`).join("\n"),
    });
  }

  return renderContext(sections);
}

function renderContext(sections: readonly ContextSection[]): string {
  return sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n") + "\n";
}
