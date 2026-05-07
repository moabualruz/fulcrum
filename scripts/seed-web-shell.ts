#!/usr/bin/env bun
// Seed local product DB (~/.fulcrum/state/product/db/main) with this repo's
// data so the web shell has something to render against.
//
// Usage: bun run scripts/seed-web-shell.ts

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { openProductDb } from "@fulcrum/web/lib/server/db.ts";
import {
  createLocalOrg,
  createProject,
  appendEvent,
} from "../src/product-kernel/store/repositories.ts";
import { createTaskAction } from "../src/services/tasks.ts";
import { createDocumentAction } from "@fulcrum/web/lib/server/documents.ts";
import { newUlid } from "../src/product-kernel/ids.ts";

const REPO = "/Users/mkh/workspace/fulcrum";

interface SubTask {
  number: string;
  title: string;
  done: boolean;
}

function parseSubTasks(md: string): SubTask[] {
  const out: SubTask[] = [];
  const re = /^- \[([ x])\] \*\*(\d+\.\d+) — ([^*]+?)\.\*\*/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    out[out.length] = {
      done: m[1] === "x",
      number: m[2]!,
      title: m[3]!.trim(),
    };
  }
  return out;
}

function readDocsTree(dir: string, base = dir): Array<{ path: string; rel: string; body: string }> {
  const out: Array<{ path: string; rel: string; body: string }> = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      out.push(...readDocsTree(p, base));
    } else if (name.endsWith(".md") && !name.endsWith(".original.md")) {
      out.push({ path: p, rel: relative(base, p), body: readFileSync(p, "utf8") });
    }
  }
  return out;
}

async function main() {
  const db = await openProductDb();
  try {
    let org = (
      await db.query<{ id: string }>(
        `SELECT id FROM orgs WHERE slug = $1`,
        ["default"],
      )
    )[0];
    if (!org) {
      org = await createLocalOrg(db, { slug: "default", name: "Default" });
      console.log("created org default");
    }
    const orgId = org.id;

    const projects: Record<string, { id: string }> = {};
    for (const def of [
      { slug: "fulcrum", name: "Fulcrum", description: "Local-first agent OS — kernel + CLI + web shell." },
      { slug: "web-shell", name: "Web Shell", description: "Product-grade SvelteKit UI on top of the kernel." },
      { slug: "infra", name: "Infra", description: "CI, plugins, and adapter glue." },
    ]) {
      const existing = (
        await db.query<{ id: string }>(
          `SELECT id FROM projects WHERE org_id = $1 AND slug = $2`,
          [orgId, def.slug],
        )
      )[0];
      const p = existing ?? (await createProject(db, { orgId, ...def }));
      projects[def.slug] = { id: p.id };
    }
    console.log(`projects: ${Object.keys(projects).join(", ")}`);

    const issuesDir = join(REPO, ".scratch/web-shell-product-grade/issues");
    const issueFiles = readdirSync(issuesDir).filter((n) => n.endsWith(".md")).sort();
    let taskCount = 0;
    for (const f of issueFiles) {
      const md = readFileSync(join(issuesDir, f), "utf8");
      for (const t of parseSubTasks(md)) {
        const existing = (
          await db.query<{ id: string }>(
            `SELECT id FROM tasks WHERE org_id = $1 AND project_id = $2 AND title = $3`,
            [orgId, projects["web-shell"]!.id, `${t.number} — ${t.title}`],
          )
        )[0];
        if (existing) continue;
        await createTaskAction(db, {
          orgId,
          projectId: projects["web-shell"]!.id,
          title: `${t.number} — ${t.title}`,
          status: t.done ? "completed" : "pending",
          priority: t.done ? 1 : 5,
        });
        taskCount++;
      }
    }
    console.log(`tasks seeded: ${taskCount}`);

    const docsDir = join(REPO, "docs");
    const docs = readDocsTree(docsDir);
    let docCount = 0;
    for (const { rel, body } of docs) {
      const title = rel.replace(/\.md$/, "");
      const existing = (
        await db.query<{ id: string }>(
          `SELECT id FROM documents WHERE org_id = $1 AND title = $2`,
          [orgId, title],
        )
      )[0];
      if (existing) continue;
      await createDocumentAction(db, {
        orgId,
        projectId: projects["fulcrum"]!.id,
        kind: rel.startsWith("adr/") ? "decision" : "note",
        title,
        body: body.slice(0, 8000),
      });
      docCount++;
    }
    console.log(`docs seeded: ${docCount}`);

    const issueDocsDir = join(REPO, ".scratch/web-shell-product-grade/issues");
    let issueDocCount = 0;
    for (const f of readdirSync(issueDocsDir).filter((n) => n.endsWith(".md"))) {
      const title = `Issue: ${f.replace(/\.md$/, "")}`;
      const existing = (
        await db.query<{ id: string }>(
          `SELECT id FROM documents WHERE org_id = $1 AND title = $2`,
          [orgId, title],
        )
      )[0];
      if (existing) continue;
      await createDocumentAction(db, {
        orgId,
        projectId: projects["web-shell"]!.id,
        kind: "spec",
        title,
        body: readFileSync(join(issueDocsDir, f), "utf8"),
      });
      issueDocCount++;
    }
    console.log(`issue docs seeded: ${issueDocCount}`);

    const runDefs = [
      { agent: "claude", model: "claude-opus-4-7", status: "succeeded", prompt: "Plan + scaffold web shell" },
      { agent: "codex",  model: "gpt-5-codex",     status: "succeeded", prompt: "Implement /search route grouped by source kind" },
      { agent: "claude", model: "claude-sonnet-4-6", status: "succeeded", prompt: "Wire SvelteKit streamed loaders" },
      { agent: "claude", model: "claude-haiku-4-5", status: "succeeded", prompt: "Implement scoreCommand fuzzy filter" },
      { agent: "codex",  model: "gpt-5-codex",     status: "failed",    prompt: "Add @playwright/test (network-blocked)" },
      { agent: "claude", model: "claude-sonnet-4-6", status: "running", prompt: "Cross-review Codex's CommandPalette implementation" },
      { agent: "codex",  model: "gpt-5-codex",     status: "queued",    prompt: "Run end-to-end Playwright user-journey spec" },
    ];
    let runCount = 0;
    for (const r of runDefs) {
      const id = newUlid();
      const startedAt = new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000));
      const endedAt = r.status === "succeeded" || r.status === "failed"
        ? new Date(startedAt.getTime() + 60_000 * (1 + Math.floor(Math.random() * 30)))
        : null;
      await db.query(
        `INSERT INTO agent_runs (id, org_id, project_id, agent, model, prompt, status, started_at, ended_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        [id, orgId, projects["web-shell"]!.id, r.agent, r.model, r.prompt, r.status, startedAt.toISOString(), endedAt?.toISOString() ?? null],
      );
      await appendEvent(db, {
        orgId,
        projectId: projects["web-shell"]!.id,
        actor: "system",
        subjectKind: "agent_run",
        subjectId: id,
        verb: r.status === "queued" ? "enqueued" : r.status === "running" ? "started" : r.status,
      });
      runCount++;
    }
    console.log(`runs seeded: ${runCount}`);

    console.log("done");
  } finally {
    await db.close();
  }
}

await main();
