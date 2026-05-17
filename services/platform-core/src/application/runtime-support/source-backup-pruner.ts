import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules"]);

export async function pruneSourceBackupFiles(
  root: string,
  opts: { dryRun?: boolean; label?: string; log?: boolean } = {},
): Promise<number> {
  let removed = 0;
  const dryRun = opts.dryRun ?? false;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path);
      } else if (entry.isFile() && entry.name.endsWith(".original.md")) {
        removed += 1;
        if (!dryRun) await rm(path, { force: true });
      }
    }
  }

  await walk(root);
  if (opts.log && removed > 0) {
    const action = dryRun ? "[dry-run] would prune" : "pruned";
    console.log(`     ${action} ${removed} source backup file(s) from ${opts.label ?? root}`);
  }
  return removed;
}
