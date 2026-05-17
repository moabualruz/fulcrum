/**
 * CLI: fulcrum skills marketplace browse|fetch|publish|verify|install
 *
 * All subcommands support --json for machine-readable output.
 * Non-zero exit on sig verification fail or feature disabled.
 */

import {
  browse,
  fetch,
  publish,
  verify,
  install,
} from "@platform-core/application/skill-supply/marketplace/procedures.ts";
import { FeatureDisabledError, SignatureVerificationError } from "@platform-core/application/skill-supply/marketplace/types.ts";

function parseKV(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--") && i + 1 < args.length) {
      const key = arg.slice(2);
      result[key] = args[i + 1]!;
      i++;
    }
  }
  return result;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function output(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (Array.isArray(data)) {
    for (const item of data) {
      const l = item as { slug: string; version: string; publisher: string };
      console.log(`${l.slug}@${l.version} (${l.publisher})`);
    }
  } else {
    const l = data as { slug: string; version: string; publisher: string };
    console.log(`${l.slug}@${l.version} (${l.publisher})`);
  }
}

export async function run(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  const json = hasFlag(rest, "--json");
  const filtered = rest.filter((a) => a !== "--json");

  try {
    switch (sub) {
      case "browse": {
        const kv = parseKV(filtered);
        const tags = kv["tags"] ? kv["tags"].split(",") : undefined;
        const results = browse({ query: kv["query"], tags });
        output(results, json);
        return;
      }
      case "fetch": {
        const kv = parseKV(filtered);
        if (!kv["slug"]) {
          console.error("usage: fulcrum skills marketplace fetch --slug <slug> [--version <v>]");
          process.exit(2);
        }
        const result = fetch({ slug: kv["slug"], version: kv["version"] });
        output(result, json);
        return;
      }
      case "publish": {
        const kv = parseKV(filtered);
        if (!kv["slug"] || !kv["version"] || !kv["content"]) {
          console.error(
            "usage: fulcrum skills marketplace publish --slug <s> --version <v> --content <c> [--description <d>] [--tags <t1,t2>] [--private-key <k>]",
          );
          process.exit(2);
        }
        const result = publish({
          slug: kv["slug"],
          version: kv["version"],
          description: kv["description"] ?? "",
          tags: kv["tags"] ? kv["tags"].split(",") : [],
          content: kv["content"],
          privateKey: kv["private-key"] ?? "",
        });
        output(result, json);
        return;
      }
      case "verify": {
        const kv = parseKV(filtered);
        if (!kv["slug"]) {
          console.error("usage: fulcrum skills marketplace verify --slug <slug>");
          process.exit(2);
        }
        const { valid, listing } = verify({ slug: kv["slug"], version: kv["version"] });
        if (json) {
          console.log(JSON.stringify({ valid, listing }, null, 2));
        } else {
          console.log(`${listing.slug}@${listing.version}: ${valid ? "VALID" : "INVALID"}`);
        }
        if (!valid) process.exit(1);
        return;
      }
      case "install": {
        const kv = parseKV(filtered);
        if (!kv["slug"]) {
          console.error("usage: fulcrum skills marketplace install --slug <slug> [--version <v>]");
          process.exit(2);
        }
        const result = install({ slug: kv["slug"], version: kv["version"] });
        output(result, json);
        return;
      }
      default:
        console.error("usage: fulcrum skills marketplace <browse|fetch|publish|verify|install>");
        process.exit(2);
    }
  } catch (err) {
    if (err instanceof FeatureDisabledError) {
      console.error(err.message);
      process.exit(1);
    }
    if (err instanceof SignatureVerificationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
