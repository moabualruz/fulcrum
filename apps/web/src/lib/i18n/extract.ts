#!/usr/bin/env bun
/**
 * CI extraction gate: scans source for t('key') calls and compares
 * against en.json. Fails if any missing or orphaned keys found.
 *
 * Usage: bun run apps/web/src/lib/i18n/extract.ts
 */

import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const SRC_ROOT = join(import.meta.dir, "../../..");
const EN_PATH = join(import.meta.dir, "locales/en.json");

const T_CALL_RE = /\bt\(\s*['"]([^'"]+)['"]\s*\)/g;
const SCAN_EXTS = new Set([".ts", ".svelte", ".js"]);

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.name === "node_modules" || e.name === ".svelte-kit") continue;
    if (e.isDirectory()) yield* walk(full);
    else if (SCAN_EXTS.has(extname(e.name))) yield full;
  }
}

async function main() {
  const enRaw = await readFile(EN_PATH, "utf8");
  const enKeys = new Set(Object.keys(JSON.parse(enRaw)));

  const usedKeys = new Set<string>();
  for await (const file of walk(join(SRC_ROOT, "src"))) {
    // skip the extract script itself and test files that test t() directly
    if (file.endsWith("extract.ts")) continue;
    const content = await readFile(file, "utf8");
    for (const match of content.matchAll(T_CALL_RE)) {
      usedKeys.add(match[1]);
    }
  }

  const missing = [...usedKeys].filter((k) => !enKeys.has(k)).sort();
  const orphaned = [...enKeys].filter((k) => !usedKeys.has(k)).sort();

  let failed = false;

  if (missing.length > 0) {
    console.error(`MISSING keys in en.json (used in source but not in catalog):`);
    for (const k of missing) console.error(`  - ${k}`);
    failed = true;
  }

  if (orphaned.length > 0) {
    console.error(`ORPHANED keys in en.json (in catalog but not used in source):`);
    for (const k of orphaned) console.error(`  - ${k}`);
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`i18n extraction gate passed: ${usedKeys.size} keys, 0 missing, 0 orphaned.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
