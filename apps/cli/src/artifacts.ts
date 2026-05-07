/**
 * CLI: `fulcrum artifacts <verb>` — hand-wired thin wrappers over tRPC client.
 * Pillar 10, issue 10-cli-commands. Until Pillar 14 codegen lands, these are
 * hand-written; the ArtifactsClient interface matches tRPC procedure shapes.
 *
 * All verbs support --json for machine-parseable output.
 */

import { writeFile } from "node:fs/promises";
import type { z } from "zod";
import type { ArtifactSchema } from "@fulcrum/server/trpc/schemas/artifacts.ts";

// --- Client interface (mirrors tRPC procedures) ---

type Artifact = z.infer<typeof ArtifactSchema>;

export interface ArtifactsClient {
  list(input: {
    projectId?: string;
    runId?: string;
    taskId?: string;
    archived?: boolean;
    mime?: string;
  }): Promise<Artifact[]>;
  show(input: { id: string }): Promise<Artifact>;
  upload(input: {
    filename: string;
    mime: string;
    sizeBytes: string;
    taskId?: string;
    runId?: string;
    projectId?: string;
  }): Promise<Artifact>;
  download(input: { id: string }): Promise<{ artifact: Artifact; bytes: Uint8Array }>;
  attach(input: { id: string; target: { kind: "task" | "run" | "doc"; id: string } }): Promise<{ ok: true }>;
  detach(input: { id: string; target: { kind: "task" | "run" | "doc"; id: string } }): Promise<{ ok: true }>;
  archive(input: { id: string }): Promise<{ ok: true; id: string }>;
  unarchive(input: { id: string }): Promise<{ ok: true; id: string }>;
  delete(input: { id: string; hard: boolean; confirm?: boolean }): Promise<{ ok: true; id: string }>;
  prune(input: {
    dryRun?: boolean;
    projectId?: string;
    confirm?: boolean;
  }): Promise<{ candidates: Artifact[]; totalBytes: string; totalCount: number }>;
}

// --- Arg parser ---

const BOOLEAN_FLAGS = new Set([
  "--json", "--hard", "--dry-run", "--confirm", "--archived", "--help", "-h",
]);

export interface ParsedArtifactsArgs {
  verb: string;
  positionals: string[];
  flags: Record<string, string | true>;
}

export function parseArtifactsArgs(argv: readonly string[]): ParsedArtifactsArgs {
  const [verb = "", ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token.startsWith("--") || token === "-h") {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(0, eq)] = token.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(token)) {
        flags[token] = true;
        continue;
      }
      const next = rest[i + 1];
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

  return { verb, positionals, flags };
}

// --- Help ---

export const ARTIFACTS_HELP = `fulcrum artifacts — manage artifacts

Usage:
  fulcrum artifacts list [--project-id <id>] [--run-id <id>] [--task-id <id>]
                         [--archived] [--mime <type>] [--json]
  fulcrum artifacts show <id> [--json]
  fulcrum artifacts upload --filename <name> --mime <type> --size-bytes <n>
                           [--task-id <id>] [--run-id <id>] [--project-id <id>] [--json]
  fulcrum artifacts download <id> --out <path> [--json]
  fulcrum artifacts attach <id> --to-task|--to-run|--to-doc <target-id> [--json]
  fulcrum artifacts detach <id> --from-task|--from-run|--from-doc <target-id> [--json]
  fulcrum artifacts archive <id> [--json]
  fulcrum artifacts unarchive <id> [--json]
  fulcrum artifacts delete <id> [--hard] [--json]
  fulcrum artifacts prune [--project-id <id>] [--dry-run] [--confirm] [--json]
`;

// --- Helpers ---

function flag(flags: Record<string, string | true>, name: string): string | undefined {
  const v = flags[`--${name}`];
  return typeof v === "string" ? v : undefined;
}

function hasFlag(flags: Record<string, string | true>, name: string): boolean {
  return flags[`--${name}`] !== undefined;
}

function requirePositional(positionals: string[], label: string): string {
  const val = positionals[0];
  if (!val) {
    console.error(`usage: fulcrum artifacts <verb> <${label}>`);
    process.exit(2);
    return ""; // unreachable
  }
  return val;
}

function output(json: boolean, data: unknown, humanFn: () => void): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    humanFn();
  }
}

// 100 MB threshold for prune confirm gate
const PRUNE_BYTES_THRESHOLD = 100 * 1024 * 1024;
const PRUNE_COUNT_THRESHOLD = 100;

// --- Main dispatcher ---

export async function run(argv: readonly string[], client: ArtifactsClient): Promise<void> {
  const parsed = parseArtifactsArgs(argv);
  const { verb, positionals, flags } = parsed;
  const json = hasFlag(flags, "json");

  if (!verb || verb === "help" || verb === "--help" || verb === "-h" || hasFlag(flags, "help")) {
    console.log(ARTIFACTS_HELP);
    return;
  }

  switch (verb) {
    case "list": {
      const input: Parameters<ArtifactsClient["list"]>[0] = {};
      const pid = flag(flags, "project-id");
      if (pid) input.projectId = pid;
      const rid = flag(flags, "run-id");
      if (rid) input.runId = rid;
      const tid = flag(flags, "task-id");
      if (tid) input.taskId = tid;
      if (hasFlag(flags, "archived")) input.archived = true;
      const mime = flag(flags, "mime");
      if (mime) input.mime = mime;

      const rows = await client.list(input);
      output(json, rows, () => {
        if (rows.length === 0) {
          console.log("no artifacts");
        } else {
          for (const r of rows) {
            console.log(
              `${r.id}\t${r.filename}\t${r.sizeBytes}B\t${r.archived ? "archived" : r.retentionStatus}\t${r.previewKind}\trun:${r.runId ?? "-"}`,
            );
          }
        }
      });
      return;
    }

    case "show": {
      const id = requirePositional(positionals, "id");
      const artifact = await client.show({ id });
      output(json, artifact, () => {
        console.log(`id:       ${artifact.id}`);
        console.log(`filename: ${artifact.filename}`);
        console.log(`mime:     ${artifact.mime ?? "unknown"}`);
        console.log(`size:     ${artifact.sizeBytes}B`);
        console.log(`archived: ${artifact.archived}`);
        console.log(`retention:${artifact.retentionStatus}${artifact.pruned ? " (pruned)" : ""}`);
        console.log(`preview:  ${artifact.previewKind === "download" ? "download only" : `inline ${artifact.previewKind}`}`);
        console.log(`run:      ${artifact.runId ?? "none"}`);
        console.log(`digest:   ${artifact.digest ?? artifact.checksumSha256 ?? "unknown"}`);
        console.log(`path:     ${artifact.path}`);
      });
      return;
    }

    case "upload": {
      const filename = flag(flags, "filename");
      const mime = flag(flags, "mime");
      const sizeBytes = flag(flags, "size-bytes");
      if (!filename || !mime || !sizeBytes) {
        console.error("usage: fulcrum artifacts upload --filename <name> --mime <type> --size-bytes <n>");
        process.exit(2);
        return;
      }
      const input: Parameters<ArtifactsClient["upload"]>[0] = { filename, mime, sizeBytes };
      const tid = flag(flags, "task-id");
      if (tid) input.taskId = tid;
      const rid = flag(flags, "run-id");
      if (rid) input.runId = rid;
      const pid = flag(flags, "project-id");
      if (pid) input.projectId = pid;

      const artifact = await client.upload(input);
      output(json, artifact, () => {
        console.log(`uploaded: ${artifact.id} (${artifact.filename})`);
      });
      return;
    }

    case "download": {
      const id = requirePositional(positionals, "id");
      const outPath = flag(flags, "out");
      if (!outPath) {
        console.error("usage: fulcrum artifacts download <id> --out <path>");
        process.exit(2);
        return;
      }
      const result = await client.download({ id });
      await writeFile(outPath, result.bytes);
      output(json, { artifact: result.artifact, path: outPath }, () => {
        console.log(`downloaded: ${result.artifact.filename} -> ${outPath} (${result.bytes.length}B)`);
        console.log(`digest: ${result.artifact.digest ?? result.artifact.checksumSha256 ?? "unknown"}`);
      });
      return;
    }

    case "attach": {
      const id = requirePositional(positionals, "id");
      const target = parseTarget(flags, "to");
      if (!target) {
        console.error("usage: fulcrum artifacts attach <id> --to-task|--to-run|--to-doc <target-id>");
        process.exit(2);
        return;
      }
      const result = await client.attach({ id, target });
      output(json, result, () => {
        console.log(`attached ${id} -> ${target.kind}:${target.id}`);
      });
      return;
    }

    case "detach": {
      const id = requirePositional(positionals, "id");
      const target = parseTarget(flags, "from");
      if (!target) {
        console.error("usage: fulcrum artifacts detach <id> --from-task|--from-run|--from-doc <target-id>");
        process.exit(2);
        return;
      }
      const result = await client.detach({ id, target });
      output(json, result, () => {
        console.log(`detached ${id} <- ${target.kind}:${target.id}`);
      });
      return;
    }

    case "archive": {
      const id = requirePositional(positionals, "id");
      const result = await client.archive({ id });
      output(json, result, () => {
        console.log(`archived: ${result.id}`);
      });
      return;
    }

    case "unarchive": {
      const id = requirePositional(positionals, "id");
      const result = await client.unarchive({ id });
      output(json, result, () => {
        console.log(`unarchived: ${result.id}`);
      });
      return;
    }

    case "delete": {
      const id = requirePositional(positionals, "id");
      const hard = hasFlag(flags, "hard");
      const result = await client.delete({ id, hard, ...(hard ? { confirm: true } : {}) });
      output(json, result, () => {
        console.log(`${hard ? "hard-" : ""}deleted: ${result.id}`);
      });
      return;
    }

    case "prune": {
      const dryRun = hasFlag(flags, "dry-run");
      const confirm = hasFlag(flags, "confirm");
      const projectId = flag(flags, "project-id");

      const input: Parameters<ArtifactsClient["prune"]>[0] = { dryRun };
      if (projectId) input.projectId = projectId;
      if (confirm) input.confirm = true;

      const result = await client.prune(input);

      // Confirm gate: >100 files or >100 MB requires --confirm
      const needsConfirm =
        result.totalCount > PRUNE_COUNT_THRESHOLD ||
        BigInt(result.totalBytes) > BigInt(PRUNE_BYTES_THRESHOLD);

      if (needsConfirm && !confirm && !dryRun) {
        console.error(
          `prune would affect ${result.totalCount} files (${result.totalBytes} bytes). ` +
          `Pass --confirm to proceed, or --dry-run to preview.`,
        );
        process.exit(1);
        return;
      }

      output(json, result, () => {
        if (result.candidates.length === 0) {
          console.log("nothing to prune");
        } else {
          for (const c of result.candidates) {
            console.log(`${c.id}\t${c.filename}\t${c.sizeBytes}B`);
          }
          console.log(`total: ${result.totalCount} files, ${result.totalBytes} bytes`);
          if (dryRun) console.log("(dry run — no files pruned)");
        }
      });
      return;
    }

    default:
      console.error(`fulcrum artifacts: unknown verb '${verb}'`);
      console.error(ARTIFACTS_HELP);
      process.exit(2);
  }
}

function parseTarget(
  flags: Record<string, string | true>,
  prefix: "to" | "from",
): { kind: "task" | "run" | "doc"; id: string } | null {
  for (const kind of ["task", "run", "doc"] as const) {
    const val = flag(flags, `${prefix}-${kind}`);
    if (val) return { kind, id: val };
  }
  return null;
}
