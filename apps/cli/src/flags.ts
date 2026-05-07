/**
 * CLI: fulcrum flags set|get|list [--json]
 *       fulcrum flags experiments list|create|metrics [--json]
 * Controls FULCRUM_FEATURES flags independently.
 */

import {
  KNOWN_FLAGS,
  isFeatureEnabled,
  setFeatureFlag,
  getEnabledFeatures,
  type FeatureFlag,
} from "@fulcrum/tui/feature-flags.ts";
import { experimentStore } from "@/flags/experiments.ts";

const knownSet = new Set<string>(KNOWN_FLAGS);

export type ExperimentsAction =
  | { action: "experiments:list" }
  | { action: "experiments:create"; name: string; variants: string[]; rolloutPercent: number }
  | { action: "experiments:metrics"; experimentId: string; conversionKind: string };

export type ParsedArgs =
  | { action: "set"; flag: FeatureFlag; value: boolean }
  | { action: "get"; flag: FeatureFlag }
  | { action: "list" }
  | ExperimentsAction
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
    case "experiments": {
      const [expSub, ...expRest] = rest;
      switch (expSub) {
        case "list":
          return { action: "experiments:list" };
        case "create": {
          // Parse --name, --variants, --rollout-percent
          const nameIdx = expRest.indexOf("--name");
          const variantsIdx = expRest.indexOf("--variants");
          const rolloutIdx = expRest.indexOf("--rollout-percent");
          const name = nameIdx >= 0 ? expRest[nameIdx + 1] ?? "" : "";
          const variantsRaw = variantsIdx >= 0 ? expRest[variantsIdx + 1] ?? "" : "";
          const rolloutRaw = rolloutIdx >= 0 ? expRest[rolloutIdx + 1] ?? "100" : "100";
          if (!name) return { action: "error", message: "usage: fulcrum flags experiments create --name <name> --variants <v1,v2> [--rollout-percent 100]" };
          const variants = variantsRaw.split(",").map((v) => v.trim()).filter(Boolean);
          if (variants.length < 2) return { action: "error", message: "--variants must list at least 2 variants (comma-separated)" };
          const rolloutPercent = Math.min(100, Math.max(0, Number.parseInt(rolloutRaw, 10) || 100));
          return { action: "experiments:create", name, variants, rolloutPercent };
        }
        case "metrics": {
          const expIdIdx = expRest.indexOf("--experiment-id");
          const kindIdx = expRest.indexOf("--conversion-kind");
          const experimentId = expIdIdx >= 0 ? expRest[expIdIdx + 1] ?? "" : "";
          const conversionKind = kindIdx >= 0 ? expRest[kindIdx + 1] ?? "" : "";
          if (!experimentId || !conversionKind) {
            return { action: "error", message: "usage: fulcrum flags experiments metrics --experiment-id <id> --conversion-kind <kind>" };
          }
          return { action: "experiments:metrics", experimentId, conversionKind };
        }
        default:
          return { action: "error", message: "usage: fulcrum flags experiments <list|create|metrics>" };
      }
    }
    default:
      return { action: "error", message: "usage: fulcrum flags <set|get|list|experiments>" };
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
    case "experiments:list": {
      const experiments = experimentStore.list();
      if (json) return JSON.stringify(experiments, null, 2);
      if (experiments.length === 0) return "No experiments.";
      return experiments.map((e) => `${e.id}  ${e.name}  [${e.variants.join(",")}]  ${e.rolloutPercent}%`).join("\n");
    }
    case "experiments:create":
      return ""; // handled by run()
    case "experiments:metrics": {
      const metrics = experimentStore.metrics(parsed.experimentId, parsed.conversionKind);
      if (json) return JSON.stringify(metrics, null, 2);
      return Object.entries(metrics)
        .map(([variant, data]) => `${variant}: assigned=${data.assigned} conversions=${data.conversions}`)
        .join("\n") || "No data.";
    }
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

  if (parsed.action === "experiments:create") {
    if (!isFeatureEnabled("experiments")) {
      console.error("experiments feature is disabled. Set FULCRUM_FEATURES=experiments to enable.");
      process.exit(2);
    }
    const exp = experimentStore.create({
      name: parsed.name,
      variants: parsed.variants,
      rolloutPercent: parsed.rolloutPercent,
    });
    if (isJson) {
      console.log(JSON.stringify(exp, null, 2));
    } else {
      console.log(`Created: ${exp.id}  ${exp.name}  [${exp.variants.join(",")}]  ${exp.rolloutPercent}%`);
    }
    return;
  }

  console.log(formatOutput(parsed, isJson));
}
