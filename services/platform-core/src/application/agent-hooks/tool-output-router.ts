// Tool-output router — applies a per-tool output strategy from
// ~/.fulcrum/tool-output-policy.toml.
//
// Tiers:
//   raw           — emit stdout unchanged
//   status-only   — emit `exit=<code> <first stderr line or "ok">`
//   summary+head  — emit `exit + bytes + lines + first N lines`
//   summary+file  — write full stdout to ~/.fulcrum/state/<project>/...; emit summary + path + head
//   file-only     — write full stdout to file; emit only `exit + bytes + path`
//   leave-as-is   — no-op (default)

import { parse as parseToml } from "smol-toml";
import { readHookEvent, projectSlug, stateDir, deriveTool } from "@platform-core/application/runtime-support/hook-event-io.ts";
import type {
  HookEvent,
  PolicyDoc,
  PolicyProfile,
  Tier,
  ToolPolicy,
} from "@platform-core/application/runtime-support/hook-types.ts";

const HEAD_LINES = Number(process.env["FULCRUM_HEAD_LINES"] ?? 20);

function defaultPolicyPath(): string {
  return process.env["FULCRUM_POLICY"] ?? `${process.env["HOME"]}/.fulcrum/tool-output-policy.toml`;
}

async function loadPolicy(path: string): Promise<PolicyDoc | null> {
  const f = Bun.file(path);
  if (!(await f.exists())) return null;
  try {
    return parseToml(await f.text()) as PolicyDoc;
  } catch (err) {
    process.stderr.write(`tool-output-router: failed to parse ${path}: ${(err as Error).message}\n`);
    return null;
  }
}

function resolvePolicy(doc: PolicyDoc, tool: string): { profile: string | null; merged: PolicyProfile } {
  const tools = doc.tools ?? {};
  const fromTool: ToolPolicy | undefined = tools[tool];
  if (!fromTool) {
    return { profile: null, merged: doc.default ?? { tier: "leave-as-is" } };
  }
  const profileName = fromTool.profile;
  if (!profileName) {
    const { profile: _drop, ...rest } = fromTool;
    return { profile: null, merged: rest };
  }
  const fromProfile: PolicyProfile = (doc.profiles ?? {})[profileName] ?? {};
  // Tool overrides win over profile.
  const { profile: _drop, ...toolRest } = fromTool;
  return { profile: profileName, merged: { ...fromProfile, ...toolRest } };
}

function pickTier(p: PolicyProfile, bytes: number): Tier {
  if (p.tier) return p.tier;
  if (typeof p.threshold_bytes === "number") {
    return bytes > p.threshold_bytes ? (p.tier_over ?? "leave-as-is") : (p.tier_under ?? "leave-as-is");
  }
  return p.tier_under ?? p.tier_over ?? "leave-as-is";
}

function head(s: string, n: number): string {
  const lines = s.split("\n");
  return lines.slice(0, n).join("\n");
}

async function writeStateFile(tool: string, body: string): Promise<string> {
  const dir = await stateDir();
  const path = `${dir}/${tool}-${Math.floor(Date.now() / 1000)}.out`;
  await Bun.write(path, body);
  return path;
}

async function applyTier(tier: Tier, event: HookEvent, tool: string): Promise<string> {
  const r = event.tool_response ?? {};
  const stdout = r.stdout ?? r.output ?? "";
  const stderr = r.stderr ?? "";
  const exit = r.exit_code ?? r.returncode ?? 0;
  const bytes = stdout.length;
  const lines = stdout ? stdout.split("\n").length - (stdout.endsWith("\n") ? 1 : 0) : 0;

  switch (tier) {
    case "raw":
      return stdout;
    case "status-only": {
      const first = stderr.split("\n")[0] ?? "";
      return `exit=${exit} ${first || "ok"}\n`;
    }
    case "summary+head":
      return `exit=${exit} bytes=${bytes} lines=${lines}\n--- head ---\n${head(stdout, HEAD_LINES)}\n`;
    case "summary+file": {
      const path = await writeStateFile(tool, stdout);
      return `exit=${exit} bytes=${bytes} lines=${lines} file=${path}\n--- head ---\n${head(stdout, HEAD_LINES)}\n`;
    }
    case "file-only": {
      const path = await writeStateFile(tool, stdout);
      return `exit=${exit} bytes=${bytes} file=${path}\n`;
    }
    case "leave-as-is":
    default:
      return stdout;
  }
}

export async function run(): Promise<void> {
  const dbg = !!process.env["FULCRUM_DEBUG"];
  if (dbg) process.stderr.write("[router] start\n");
  const event = await readHookEvent();
  if (dbg) process.stderr.write(`[router] event=${JSON.stringify(event).slice(0, 100)}\n`);
  const tool = deriveTool(event);
  if (dbg) process.stderr.write(`[router] tool='${tool}'\n`);
  if (!tool) return;

  const policyPath = defaultPolicyPath();
  const doc = await loadPolicy(policyPath);
  if (!doc) {
    // No policy file → silently no-op (router is a no-op when uninstalled).
    return;
  }

  const { merged } = resolvePolicy(doc, tool);
  const stdout = event.tool_response?.stdout ?? event.tool_response?.output ?? "";
  const tier = pickTier(merged, stdout.length);

  const out = await applyTier(tier, event, tool);
  if (process.env["FULCRUM_DEBUG"]) {
    process.stderr.write(`[router] tool=${tool} tier=${tier} bytes=${out.length}\n`);
  }
  process.stdout.write(out);
}

if (import.meta.main) {
  await run();
}
