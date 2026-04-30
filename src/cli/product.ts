import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import {
  createLocalOrg,
  type ProjectRow,
} from "../product-kernel/store/repositories.ts";
import { searchProductDocuments } from "../product-kernel/search.ts";
import { assembleContext } from "../product-kernel/context.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";

const HELP = `fulcrum product — local product kernel

Usage:
  fulcrum product init [--json]
  fulcrum product projects list [--json]
  fulcrum product search <query> [--org-slug <slug>] [--limit <N>] [--json]
  fulcrum product context assemble --task <id> [--org-slug <slug>] [--json]
`;

const DEFAULT_ORG_SLUG = "default";
const DEFAULT_ORG_NAME = "Local";

async function openProductDb(): Promise<ProductDb> {
  const dir = productDbDir();
  await mkdir(dir, { recursive: true });
  return openPglite(join(dir, "main"));
}

async function ensureLocalOrg(db: ProductDb): Promise<{ id: string; slug: string; name: string; created: boolean }> {
  const existing = await db.query<{ id: string; slug: string; name: string }>(
    `SELECT id, slug, name FROM orgs WHERE slug = $1`,
    [DEFAULT_ORG_SLUG],
  );
  if (existing[0]) return { ...existing[0], created: false };
  const org = await createLocalOrg(db, { slug: DEFAULT_ORG_SLUG, name: DEFAULT_ORG_NAME });
  return { id: org.id, slug: org.slug, name: org.name, created: true };
}

function parseFlag(args: readonly string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(`--${name}`);
}

export async function run(argv: readonly string[]): Promise<void> {
  const [verb, ...rest] = argv;
  if (!verb || verb === "help" || verb === "--help" || verb === "-h") {
    console.log(HELP);
    return;
  }
  switch (verb) {
    case "init":
      return runInit(rest);
    case "projects":
      return runProjects(rest);
    case "search":
      return runSearch(rest);
    case "context":
      return runContext(rest);
    default:
      console.error(`fulcrum product: unknown verb '${verb}'`);
      console.error(HELP);
      process.exit(2);
  }
}

async function runInit(argv: readonly string[]): Promise<void> {
  const json = hasFlag(argv, "json");
  const db = await openProductDb();
  try {
    const applied = await runMigrations(db);
    const org = await ensureLocalOrg(db);
    const result = {
      engine: db.engine,
      schemaApplied: applied,
      org: { id: org.id, slug: org.slug, name: org.name, created: org.created },
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`product kernel ready (engine=${result.engine})`);
      console.log(`org=${org.slug} (${org.id})${org.created ? " [created]" : ""}`);
      if (applied.length > 0) console.log(`migrations: ${applied.join(", ")}`);
    }
  } finally {
    await db.close();
  }
}

async function runProjects(argv: readonly string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "list") {
    console.error(`fulcrum product projects: unknown verb '${sub ?? ""}'`);
    process.exit(2);
  }
  const json = hasFlag(rest, "json");
  const db = await openProductDb();
  try {
    await runMigrations(db);
    const rows = await db.query<ProjectRow>(
      `SELECT * FROM projects ORDER BY created_at ASC, id ASC`,
    );
    if (json) {
      console.log(JSON.stringify(rows, null, 2));
    } else if (rows.length === 0) {
      console.log("no projects");
    } else {
      for (const p of rows) console.log(`${p.slug}\t${p.name}\t${p.id}`);
    }
  } finally {
    await db.close();
  }
}

async function runSearch(argv: readonly string[]): Promise<void> {
  const positional = argv.filter((v) => !v.startsWith("--"));
  const query = positional[0];
  if (!query) {
    console.error("usage: fulcrum product search <query>");
    process.exit(2);
  }
  const json = hasFlag(argv, "json");
  const orgSlug = parseFlag(argv, "org-slug") ?? DEFAULT_ORG_SLUG;
  const limit = Number(parseFlag(argv, "limit") ?? "25");
  const db = await openProductDb();
  try {
    await runMigrations(db);
    const orgRows = await db.query<{ id: string }>(
      `SELECT id FROM orgs WHERE slug = $1`,
      [orgSlug],
    );
    const orgId = orgRows[0]?.id;
    if (!orgId) {
      if (json) console.log("[]");
      else console.log(`no org with slug=${orgSlug}`);
      return;
    }
    const hits = await searchProductDocuments(db, query, { orgId, limit });
    if (json) {
      console.log(JSON.stringify(hits, null, 2));
    } else if (hits.length === 0) {
      console.log("no hits");
    } else {
      for (const h of hits) {
        console.log(`${h.score.toFixed(4)}\t${h.source_kind}:${h.source_id}\t${h.title}`);
      }
    }
  } finally {
    await db.close();
  }
}

async function runContext(argv: readonly string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "assemble") {
    console.error(`fulcrum product context: unknown verb '${sub ?? ""}'`);
    process.exit(2);
  }
  const taskId = parseFlag(rest, "task");
  if (!taskId) {
    console.error("usage: fulcrum product context assemble --task <id>");
    process.exit(2);
  }
  const orgSlug = parseFlag(rest, "org-slug") ?? DEFAULT_ORG_SLUG;
  const json = hasFlag(rest, "json");
  const db = await openProductDb();
  try {
    await runMigrations(db);
    const orgRows = await db.query<{ id: string }>(
      `SELECT id FROM orgs WHERE slug = $1`,
      [orgSlug],
    );
    const orgId = orgRows[0]?.id;
    if (!orgId) {
      if (json) console.log(JSON.stringify({ error: "unknown org" }));
      else console.error(`no org with slug=${orgSlug}`);
      process.exit(1);
    }
    const body = await assembleContext(db, { orgId: orgId as string, taskId });
    if (json) console.log(JSON.stringify({ taskId, body }, null, 2));
    else console.log(body);
  } finally {
    await db.close();
  }
}
