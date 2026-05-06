import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openDatabase, resolveDatabaseConfig } from "../config/database.ts";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { applyProductMigrations } from "../db/product-migrations.ts";
import {
  createTask,
  updateTask,
  moveTaskToSprint,
  listTasks,
  createSprint,
  updateSprint,
  listSprints,
  listCustomFields,
  listSavedViews,
  type ProjectRow,
  type TaskRow,
  type SprintRow,
} from "../product-kernel/store/repositories.ts";
import { eventDispatcher } from "../product-kernel/event-dispatcher.ts";
import { searchProductDocuments } from "../product-kernel/search.ts";
import { assembleContext } from "../product-kernel/context.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";
import { productDbDir } from "../product-kernel/paths.ts";

const HELP = `fulcrum product — local product kernel

Usage:
  fulcrum product init [--json]
  fulcrum product projects list [--json] [--limit <N>]
  fulcrum product tasks create --title <T> --project <P> [--json]
  fulcrum product tasks list [--status <S>] [--assignee <A>] [--project <P>] [--json]
  fulcrum product tasks update <id> --status <S> [--json]
  fulcrum product tasks bulk <id,id,...> --status <S> [--json]
  fulcrum product tasks move <id> --sprint <S> [--json]
  fulcrum product sprints list --project <P> [--json]
  fulcrum product sprints activate <id> [--json]
  fulcrum product sprints complete <id> [--json]
  fulcrum product custom-fields list --project <P> [--json]
  fulcrum product saved-views list --project <P> [--json]
  fulcrum product search <query> [--org-slug <slug>] [--kind <kind>] [--limit <N>] [--json]
  fulcrum product context assemble --task <id> [--org-slug <slug>] [--json]
`;

const DEFAULT_ORG_SLUG = "default";
const DEFAULT_ORG_NAME = "Local";

async function openProductDb(): Promise<ProductDb> {
  const legacyDir = productDbDir();
  const legacyPath = join(legacyDir, "main");
  if (await Bun.file(join(legacyPath, "PG_VERSION")).exists()) {
    await mkdir(legacyDir, { recursive: true });
    return openPglite(legacyPath);
  }
  return openDatabase(resolveDatabaseConfig());
}

async function ensureLocalOrg(db: ProductDb): Promise<{ id: string; slug: string; name: string; created: boolean }> {
  const existing = await db.query<{ id: string; slug: string; name: string }>(
    `SELECT id, slug, name FROM orgs WHERE slug = $1`,
    [DEFAULT_ORG_SLUG],
  );
  if (existing[0]) return { ...existing[0], created: false };
  const rows = await db.query<{ id: string; slug: string; name: string }>(
    `INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3) RETURNING id, slug, name`,
    [crypto.randomUUID(), DEFAULT_ORG_SLUG, DEFAULT_ORG_NAME],
  );
  const org = rows[0];
  if (!org) throw new Error("failed to create local org");
  return { id: org.id, slug: org.slug, name: org.name, created: true };
}

// Flag spec: every flag we expose. Boolean flags are listed in BOOLEAN_FLAGS
// so the parser knows not to consume the next argv slot as a value. This is
// the smallest contract that fixes
// `.scratch/migration-review-remediation/issues/16-product-cli-flag-parser.md`:
// flag values must not be misread as positionals, regardless of order.
const BOOLEAN_FLAGS = new Set<string>(["--json"]);
const VALUE_FLAGS = new Set<string>([
  "--assignee",
  "--kind",
  "--limit",
  "--org-slug",
  "--project",
  "--sprint",
  "--status",
  "--task",
  "--title",
]);
const KNOWN_FLAGS = new Set<string>([...BOOLEAN_FLAGS, ...VALUE_FLAGS]);

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
  passthrough: string[];
}

export function parseProductArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  const passthrough: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === "--") {
      passthrough.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const name = eq === -1 ? token : token.slice(0, eq);
      if (!KNOWN_FLAGS.has(name)) {
        throw new Error(`unknown flag: ${name}`);
      }
      if (eq !== -1) {
        if (BOOLEAN_FLAGS.has(name)) {
          throw new Error(`flag does not take a value: ${name}`);
        }
        flags[name] = token.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(token)) {
        flags[token] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`missing value for flag: ${token}`);
      }
      flags[token] = next;
      i += 1;
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags, passthrough };
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
    case "tasks":
      return runTasks(rest);
    case "sprints":
      return runSprints(rest);
    case "custom-fields":
      return runCustomFields(rest);
    case "saved-views":
      return runSavedViews(rest);
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
    await applyProductMigrations(db);
    const org = await ensureLocalOrg(db);
    const result = {
      engine: db.engine,
      schemaApplied: [],
      org: { id: org.id, slug: org.slug, name: org.name, created: org.created },
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`product kernel ready (engine=${result.engine})`);
      console.log(`org=${org.slug} (${org.id})${org.created ? " [created]" : ""}`);
    }
  } catch (error) {
    throw new Error(`Database schema not initialized. Run fulcrum db migrate. ${(error as Error).message}`);
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
    await applyProductMigrations(db);
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

async function runTasks(argv: readonly string[]): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "create":
      return runTasksCreate(rest);
    case "list":
      return runTasksList(rest);
    case "update":
      return runTasksUpdate(rest);
    case "bulk":
      return runTasksBulk(rest);
    case "move":
      return runTasksMove(rest);
    default:
      console.error(`fulcrum product tasks: unknown verb '${sub ?? ""}'`);
      process.exit(2);
  }
}

async function runTasksCreate(argv: readonly string[]): Promise<void> {
  const json = hasFlag(argv, "json");
  const title = parseFlag(argv, "title");
  const projectSlug = parseFlag(argv, "project");
  if (!title) {
    console.error("usage: fulcrum product tasks create --title <T> --project <P>");
    process.exit(2);
  }
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    const org = await ensureLocalOrg(db);
    let projectId: string | null = null;
    if (projectSlug) {
      const rows = await db.query<ProjectRow>(
        `SELECT * FROM projects WHERE slug = $1 AND org_id = $2`,
        [projectSlug, org.id],
      );
      if (rows.length === 0) {
        const msg = `project not found: ${projectSlug}`;
        if (json) console.log(JSON.stringify({ error: msg }));
        else console.error(msg);
        process.exit(1);
      }
      projectId = (rows[0] as ProjectRow).id;
    }
    const task = await createTask(db, {
      orgId: org.id,
      projectId,
      title,
    });
    if (json) {
      console.log(JSON.stringify({ id: task.id, title: task.title, status: task.status }));
    } else {
      console.log(`created task ${task.id} (${task.title})`);
    }
  } finally {
    await db.close();
  }
}

async function runTasksList(argv: readonly string[]): Promise<void> {
  const json = hasFlag(argv, "json");
  const status = parseFlag(argv, "status");
  const assignee = parseFlag(argv, "assignee");
  const projectSlug = parseFlag(argv, "project");
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    const org = await ensureLocalOrg(db);
    let projectId: string | undefined;
    if (projectSlug) {
      const rows = await db.query<ProjectRow>(
        `SELECT * FROM projects WHERE slug = $1 AND org_id = $2`,
        [projectSlug, org.id],
      );
      projectId = (rows[0] as ProjectRow | undefined)?.id;
    }
    // Map CLI-friendly status names to DB values
    const dbStatus = status === "open" ? "pending" : status === "done" ? "completed" : status;
    const result = await listTasks(db, {
      projectId,
      status: dbStatus ?? undefined,
      assigneeId: assignee === "me" ? "local" : assignee ?? undefined,
    });
    if (json) {
      console.log(JSON.stringify(result.data));
    } else if (result.data.length === 0) {
      console.log("no tasks");
    } else {
      for (const t of result.data) console.log(`${t.id}\t${t.status}\t${t.title}`);
    }
  } finally {
    await db.close();
  }
}

async function runTasksUpdate(argv: readonly string[]): Promise<void> {
  const json = hasFlag(argv, "json");
  const positionals = positionalsOf(argv);
  const taskId = positionals[0];
  if (!taskId) {
    console.error("usage: fulcrum product tasks update <id> --status <S>");
    process.exit(2);
  }
  const status = parseFlag(argv, "status");
  const title = parseFlag(argv, "title");
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    const dbStatus = status === "open" ? "pending" : status === "done" ? "completed" : status;
    const task = await updateTask(db, {
      id: taskId,
      ...(dbStatus ? { status: dbStatus } : {}),
      ...(title ? { title } : {}),
    });
    if (json) {
      console.log(JSON.stringify({ id: task.id, title: task.title, status: task.status }));
    } else {
      console.log(`updated task ${task.id} → ${task.status}`);
    }
  } finally {
    await db.close();
  }
}

async function runTasksBulk(argv: readonly string[]): Promise<void> {
  const json = hasFlag(argv, "json");
  const positionals = positionalsOf(argv);
  const idsArg = positionals[0];
  if (!idsArg) {
    console.error("usage: fulcrum product tasks bulk <id,id,...> --status <S>");
    process.exit(2);
  }
  const ids = idsArg.split(",");
  const status = parseFlag(argv, "status");
  if (!status) {
    console.error("--status required for bulk update");
    process.exit(2);
  }
  const dbStatus = status === "open" ? "pending" : status === "done" ? "completed" : status;
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    const results: { id: string; title: string; status: string }[] = [];
    for (const id of ids) {
      const task = await updateTask(db, { id, status: dbStatus });
      results.push({ id: task.id, title: task.title, status: task.status });
    }
    if (json) {
      console.log(JSON.stringify(results));
    } else {
      for (const r of results) console.log(`${r.id}\t${r.status}\t${r.title}`);
    }
  } finally {
    await db.close();
  }
}

async function runTasksMove(argv: readonly string[]): Promise<void> {
  const json = hasFlag(argv, "json");
  const positionals = positionalsOf(argv);
  const taskId = positionals[0];
  const sprintId = parseFlag(argv, "sprint");
  if (!taskId || !sprintId) {
    console.error("usage: fulcrum product tasks move <id> --sprint <S>");
    process.exit(2);
  }
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    const task = await moveTaskToSprint(db, taskId, sprintId);
    if (json) {
      console.log(JSON.stringify({ id: task.id, title: task.title, sprint_id: sprintId }));
    } else {
      console.log(`moved task ${task.id} → sprint ${sprintId}`);
    }
  } finally {
    await db.close();
  }
}

async function runSprints(argv: readonly string[]): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "list":
      return runSprintsList(rest);
    case "activate":
      return runSprintsActivate(rest);
    case "complete":
      return runSprintsComplete(rest);
    default:
      console.error(`fulcrum product sprints: unknown verb '${sub ?? ""}'`);
      process.exit(2);
  }
}

async function runSprintsList(argv: readonly string[]): Promise<void> {
  const json = hasFlag(argv, "json");
  const projectSlug = parseFlag(argv, "project");
  if (!projectSlug) {
    console.error("usage: fulcrum product sprints list --project <P>");
    process.exit(2);
  }
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    const org = await ensureLocalOrg(db);
    const rows = await db.query<ProjectRow>(
      `SELECT * FROM projects WHERE slug = $1 AND org_id = $2`,
      [projectSlug, org.id],
    );
    if (rows.length === 0) {
      if (json) console.log("[]");
      else console.log("project not found");
      return;
    }
    const sprints = await listSprints(db, (rows[0] as ProjectRow).id);
    if (json) {
      console.log(JSON.stringify(sprints));
    } else if (sprints.length === 0) {
      console.log("no sprints");
    } else {
      for (const s of sprints) console.log(`${s.id}\t${s.status}\t${s.name}`);
    }
  } finally {
    await db.close();
  }
}

async function runSprintsActivate(argv: readonly string[]): Promise<void> {
  const json = hasFlag(argv, "json");
  const positionals = positionalsOf(argv);
  const sprintId = positionals[0];
  if (!sprintId) {
    console.error("usage: fulcrum product sprints activate <id>");
    process.exit(2);
  }
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    // Check current status
    const existing = await db.query<SprintRow>(`SELECT * FROM sprints WHERE id = $1`, [sprintId]);
    if (existing.length === 0) {
      const msg = `sprint not found: ${sprintId}`;
      if (json) console.log(JSON.stringify({ error: msg }));
      else console.error(msg);
      process.exit(1);
      return;
    }
    const current = existing[0] as SprintRow;
    if (current.status === "active") {
      const msg = `sprint already active: ${sprintId}`;
      if (json) console.log(JSON.stringify({ error: msg }));
      else console.error(msg);
      process.exit(1);
      return;
    }
    const sprint = await updateSprint(db, { id: sprintId, status: "active" });
    await eventDispatcher.dispatch(db, {
      orgId: sprint.org_id,
      projectId: sprint.project_id,
      actor: "system",
      subjectKind: "sprint",
      subjectId: sprint.id,
      verb: "activated",
    });
    if (json) {
      console.log(JSON.stringify({ id: sprint.id, name: sprint.name, status: sprint.status }));
    } else {
      console.log(`activated sprint ${sprint.id} (${sprint.name})`);
    }
  } finally {
    await db.close();
  }
}

async function runSprintsComplete(argv: readonly string[]): Promise<void> {
  const json = hasFlag(argv, "json");
  const positionals = positionalsOf(argv);
  const sprintId = positionals[0];
  if (!sprintId) {
    console.error("usage: fulcrum product sprints complete <id>");
    process.exit(2);
  }
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    const sprint = await updateSprint(db, { id: sprintId, status: "completed" });
    // Velocity rollup: count completed tasks in this sprint
    const completedTasks = await db.query<{ cnt: string }>(
      `SELECT count(*) as cnt FROM tasks WHERE sprint_id = $1 AND status = 'completed'`,
      [sprintId],
    );
    const velocity = Number((completedTasks[0] as { cnt: string }).cnt);
    await eventDispatcher.dispatch(db, {
      orgId: sprint.org_id,
      projectId: sprint.project_id,
      actor: "system",
      subjectKind: "sprint",
      subjectId: sprint.id,
      verb: "completed",
      payload: { velocity },
    });
    if (json) {
      console.log(JSON.stringify({ id: sprint.id, name: sprint.name, status: sprint.status, velocity }));
    } else {
      console.log(`completed sprint ${sprint.id} (${sprint.name}), velocity=${velocity}`);
    }
  } finally {
    await db.close();
  }
}

async function runCustomFields(argv: readonly string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "list") {
    console.error(`fulcrum product custom-fields: unknown verb '${sub ?? ""}'`);
    process.exit(2);
  }
  const json = hasFlag(rest, "json");
  const projectSlug = parseFlag(rest, "project");
  if (!projectSlug) {
    console.error("usage: fulcrum product custom-fields list --project <P>");
    process.exit(2);
  }
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    const org = await ensureLocalOrg(db);
    const rows = await db.query<ProjectRow>(
      `SELECT * FROM projects WHERE slug = $1 AND org_id = $2`,
      [projectSlug, org.id],
    );
    if (rows.length === 0) {
      if (json) console.log("[]");
      else console.log("project not found");
      return;
    }
    const fields = await listCustomFields(db, (rows[0] as ProjectRow).id);
    if (json) {
      console.log(JSON.stringify(fields));
    } else if (fields.length === 0) {
      console.log("no custom fields");
    } else {
      for (const f of fields) console.log(`${f.id}\t${f.field_type}\t${f.name}`);
    }
  } finally {
    await db.close();
  }
}

async function runSavedViews(argv: readonly string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "list") {
    console.error(`fulcrum product saved-views: unknown verb '${sub ?? ""}'`);
    process.exit(2);
  }
  const json = hasFlag(rest, "json");
  const projectSlug = parseFlag(rest, "project");
  if (!projectSlug) {
    console.error("usage: fulcrum product saved-views list --project <P>");
    process.exit(2);
  }
  const db = await openProductDb();
  try {
    await applyProductMigrations(db);
    const org = await ensureLocalOrg(db);
    const rows = await db.query<ProjectRow>(
      `SELECT * FROM projects WHERE slug = $1 AND org_id = $2`,
      [projectSlug, org.id],
    );
    if (rows.length === 0) {
      if (json) console.log("[]");
      else console.log("project not found");
      return;
    }
    const views = await listSavedViews(db, (rows[0] as ProjectRow).id);
    if (json) {
      console.log(JSON.stringify(views));
    } else if (views.length === 0) {
      console.log("no saved views");
    } else {
      for (const v of views) console.log(`${v.id}\t${v.name}`);
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
    await applyProductMigrations(db);
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
    await applyProductMigrations(db);
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
