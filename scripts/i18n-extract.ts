#!/usr/bin/env bun
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

interface CheckInput {
  roots?: string[];
  catalogPath?: string;
}

export interface I18nCheckResult {
  ok: boolean;
  missing: string[];
  extra: string[];
  referenced: string[];
  catalog: string[];
}

const DEFAULT_ROOTS = ["src/web/src", "src/i18n"];
const DEFAULT_CATALOG = "src/i18n/locales/en.json";
const SOURCE_EXTENSIONS = new Set([".ts", ".svelte"]);

export async function checkI18nCatalog(input: CheckInput = {}): Promise<I18nCheckResult> {
  const roots = input.roots ?? DEFAULT_ROOTS;
  const catalogPath = input.catalogPath ?? DEFAULT_CATALOG;
  const referenced = new Set<string>();

  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*["']([a-zA-Z0-9_.-]+)["']/g)) {
        referenced.add(match[1]!);
      }
    }
  }

  const catalog = flattenCatalog(JSON.parse(await readFile(catalogPath, "utf8")));
  const catalogSet = new Set(catalog);
  const referencedKeys = [...referenced].sort();
  const missing = referencedKeys.filter((key) => !catalogSet.has(key));
  const extra = catalog.filter((key) => !referenced.has(key));

  return {
    ok: missing.length === 0 && extra.length === 0,
    missing,
    extra,
    referenced: referencedKeys,
    catalog,
  };
}

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".svelte-kit", "dist"].includes(entry.name)) {
        files.push(...await sourceFiles(path));
      }
      continue;
    }
    const dot = entry.name.lastIndexOf(".");
    const ext = dot === -1 ? "" : entry.name.slice(dot);
    if (SOURCE_EXTENSIONS.has(ext) && !entry.name.includes(".test.")) files.push(path);
  }
  return files;
}

function flattenCatalog(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? [next] : flattenCatalog(child, next);
  }).sort();
}

if (import.meta.main) {
  const result = await checkI18nCatalog();
  if (!result.ok) {
    for (const key of result.missing) console.error(`missing i18n key: ${key}`);
    for (const key of result.extra) console.error(`orphaned i18n key: ${key}`);
    process.exit(1);
  }
  console.log(`i18n catalog ok (${result.catalog.length} keys, ${result.referenced.length} referenced)`);
}
