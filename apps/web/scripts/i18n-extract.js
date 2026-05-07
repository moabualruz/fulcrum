/**
 * i18n extraction script: compares en.json keys with all other locale files,
 * reports missing/untranslated keys and exits non-zero if any found.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "../messages");

export default async function extract() {
  const files = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
  const enPath = join(messagesDir, "en.json");
  const enKeys = Object.keys(JSON.parse(readFileSync(enPath, "utf-8")));

  let totalMissing = 0;

  for (const file of files) {
    if (file === "en.json") continue;
    const locale = file.replace(".json", "");
    const catalog = JSON.parse(readFileSync(join(messagesDir, file), "utf-8"));
    const missing = enKeys.filter((k) => !(k in catalog));

    if (missing.length > 0) {
      console.error(`[i18n:extract] ${locale}: ${missing.length} untranslated keys:`);
      for (const k of missing) console.error(`  - ${k}`);
      totalMissing += missing.length;
    } else {
      console.log(`[i18n:extract] ${locale}: OK (${enKeys.length} keys)`);
    }
  }

  if (totalMissing > 0) {
    console.error(`\n[i18n:extract] FAIL: ${totalMissing} untranslated keys found`);
    process.exit(1);
  } else {
    console.log(`\n[i18n:extract] OK: 0 untranslated keys`);
  }
}
