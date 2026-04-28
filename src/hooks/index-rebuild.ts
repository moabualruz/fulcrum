// Stop / SessionEnd — rebuild ctags + graphify + repomix only when
// HEAD changed or working tree is dirty. SHA cached under os.tmpdir().

import { tmpdir } from "node:os";
import { run, which, exists } from "../utils/proc.ts";
import { projectSlug } from "../utils/io.ts";

export async function runHook(): Promise<void> {
  const slug = projectSlug();
  const shaFile = `${tmpdir()}/${slug}.index-sha`;

  // git state
  const head = await run(["git", "rev-parse", "HEAD"]);
  const status = await run(["git", "status", "--porcelain"]);
  const currSha = head.exit === 0 ? head.stdout.trim() : "no-git";
  const dirty = status.exit === 0 ? status.stdout : "";

  let lastSha = "";
  if (await exists(shaFile)) {
    lastSha = (await Bun.file(shaFile).text()).trim();
  }

  if (lastSha === currSha && !dirty.trim()) return;

  const tasks: Promise<unknown>[] = [];

  if (await which("ctags")) {
    tasks.push(run(["ctags", "-R", "--exclude=.git", "--exclude=node_modules", "."]));
  }
  if (await which("graphify")) {
    tasks.push(run(["graphify", "build", "."]));
  }
  if (await which("repomix")) {
    tasks.push(run(["repomix", "--compress", "-o", `${tmpdir()}/${slug}.xml`]));
  }

  const results = await Promise.allSettled(tasks);
  if (process.env["FULCRUM_DEBUG"]) {
    for (const r of results) {
      if (r.status === "rejected") {
        process.stderr.write(`[index-rebuild] task failed: ${String(r.reason)}\n`);
      }
    }
  }
  await Bun.write(shaFile, currSha);
}
