/**
 * CLI: fulcrum flags set|get|list [--json]
 * Controls FULCRUM_FEATURES flags independently.
 */

import {
  KNOWN_FLAGS,
  isFeatureEnabled,
  setFeatureFlag,
  getEnabledFeatures,
  type FeatureFlag,
} from "../tui/feature-flags.ts";

const knownSet = new Set<string>(KNOWN_FLAGS);

export type ParsedArgs =
  | { action: "set"; flag: FeatureFlag; value: boolean }
  | { action: "get"; flag: FeatureFlag }
  | { action: "list" }
  | { action: "error"; message: string };

export function parseArgs(args: string[]): ParsedArgs {
  const [sub, ...rest] = args;

  switch (sub) {
    case "set": {
      const [flag, val] = rest;
      if (!flag || !val) return { action: "error", message: "usage: fulcrum flags set <flag> on|off" };
      if (!knownSet.has(flag)) return { action: "error", message: `unknown flag: ${flag}` };
      const enabled = val === "on" || val === "true" || val === "1";
      return { action: "set", flag: flag as FeatureFlag, value: enabled };
    }
    case "get": {
      const [flag] = rest;
      if (!flag) return { action: "error", message: "usage: fulcrum flags get <flag>" };
      if (!knownSet.has(flag)) return { action: "error", message: `unknown flag: ${flag}` };
      return { action: "get", flag: flag as FeatureFlag };
    }
    case "list":
      return { action: "list" };
    default:
      return { action: "error", message: "usage: fulcrum flags <set|get|list>" };
  }
}

export function formatOutput(parsed: ParsedArgs, json: boolean): string {
  switch (parsed.action) {
    case "list": {
      if (json) {
        const obj: Record<string, boolean> = {};
        for (const f of KNOWN_FLAGS) obj[f] = isFeatureEnabled(f);
        return JSON.stringify(obj, null, 2);
      }
      return KNOWN_FLAGS.map(
        (f) => `${f}: ${isFeatureEnabled(f) ? "ON" : "OFF"}`
      ).join("\n");
    }
    case "get": {
      const val = isFeatureEnabled(parsed.flag);
      if (json) return JSON.stringify({ flag: parsed.flag, enabled: val });
      return `${parsed.flag}: ${val ? "ON" : "OFF"}`;
    }
    case "set":
      return ""; // handled by run()
    case "error":
      return parsed.message;
  }
}

export async function run(args: string[]): Promise<void> {
  const isJson = args.includes("--json");
  const filtered = args.filter((a) => a !== "--json");
  const parsed = parseArgs(filtered);

  if (parsed.action === "error") {
    console.error(parsed.message);
    process.exit(2);
  }

  if (parsed.action === "set") {
    setFeatureFlag(parsed.flag, parsed.value);
    const state = parsed.value ? "ON" : "OFF";
    if (isJson) {
      console.log(JSON.stringify({ flag: parsed.flag, enabled: parsed.value }));
    } else {
      console.log(`${parsed.flag}: ${state}`);
    }
    return;
  }

  console.log(formatOutput(parsed, isJson));
}
