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
  fulcrum product search <query> [--org-slug <slug>] [--kind <kind>] [--limit <N>] [--json]
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

// Flag spec: every flag we expose. Boolean flags are listed in BOOLEAN_FLAGS
// so the parser knows not to consume the next argv slot as a value. This is
// the smallest contract that fixes
// `.scratch/migration-review-remediation/issues/16-product-cli-flag-parser.md`:
// flag values must not be misread as positionals, regardless of order.
const BOOLEAN_FLAGS = new Set<string>(["--json"]);

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
}

function parseProductArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  let stopFlags = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (stopFlags) { positionals.push(token); continue; }
    if (token === "--") { stopFlags = true; continue; }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(0, eq)] = token.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(token)) {
        flags[token] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[token] = next;
        i += 1;
        continue;
      }
      flags[token] = true;
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags };
}

function parseFlag(args: readonly string[], name: string): string | undefined {
  const parsed = parseProductArgs(args);
  const value = parsed.flags[`--${name}`];
  return typeof value === "string" ? value : undefined;
}

function hasFlag(args: readonly string[], name: string): boolean {
  const parsed = parseProductArgs(args);
  return parsed.flags[`--${name}`] !== undefined;
}

function positionalsOf(args: readonly string[]): string[] {
  return parseProductArgs(args).positionals;
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
  const positional = positionalsOf(argv);
  const query = positional[0];
  if (!query) {
    console.error("usage: fulcrum product search <query>");
    process.exit(2);
  }
  const json = hasFlag(argv, "json");
  const orgSlug = parseFlag(argv, "org-slug") ?? DEFAULT_ORG_SLUG;
  const kind = parseFlag(argv, "kind");
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
    const sourceKinds = kind ? [kind] : undefined;
    const hits = await searchProductDocuments(db, query, { orgId, limit, sourceKinds });
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
