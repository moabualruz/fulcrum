#!/usr/bin/env bun
/**
 * ci:schemas — schema registry integrity check.
 * Imports all schema files from src/trpc/schemas/ and asserts:
 *   1. At least 20 schema files exist.
 *   2. No exported ZodObject field uses z.any().
 *
 * Exits non-zero on any violation.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const SCHEMAS_DIR = join(import.meta.dir, "../src/trpc/schemas");

const schemaFiles = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith(".ts"));

let failed = false;

// 1. Count check
if (schemaFiles.length < 20) {
  console.error(`ci:schemas FAIL — expected ≥20 schema files, found ${schemaFiles.length}`);
  failed = true;
} else {
  console.log(`ci:schemas OK — ${schemaFiles.length} schema files found`);
}

// 2. z.any() check on all exported ZodObject schemas
for (const file of schemaFiles) {
  const mod = await import(join(SCHEMAS_DIR, file));
  for (const [exportName, exported] of Object.entries(mod)) {
    if (!(exported instanceof z.ZodType)) continue;
    if (!(exported instanceof z.ZodObject)) continue;
    const shape = (exported as z.ZodObject<z.ZodRawShape>).shape;
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      if (fieldSchema instanceof z.ZodAny) {
        console.error(
          `ci:schemas FAIL — ${file}:${exportName}.${fieldName} uses z.any() on a public field`
        );
        failed = true;
      }
    }
  }
}

if (!failed) {
  console.log("ci:schemas OK — no z.any() on public fields");
}

process.exit(failed ? 1 : 0);
