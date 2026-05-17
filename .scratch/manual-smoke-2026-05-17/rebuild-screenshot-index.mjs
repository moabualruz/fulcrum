import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = "/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/screenshots";
const files = readdirSync(root).filter(f => f.endsWith(".png")).sort();
const entries = files.map(name => {
  const stats = statSync(join(root, name));
  return { name, path: join(root, name), size: stats.size, mtime: stats.mtime };
});
const out = {
  total: entries.length,
  generatedAt: new Date().toISOString(),
  entries,
};
writeFileSync("/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/screenshot-index.json", JSON.stringify(out, null, 2));
console.log(`indexed ${entries.length} screenshots`);
