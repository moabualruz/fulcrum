// SessionStart — warn if tags / graphify-out are stale or missing.
// Cross-platform stat via Node fs.

import { stat } from "node:fs/promises";
import { exists } from "../utils/proc.ts";

const STALE_AGE_SECONDS = 3600;

export async function runHook(): Promise<void> {
  const now = Date.now() / 1000;
  const messages: string[] = [];

  if (await exists("tags")) {
    try {
      const s = await stat("tags");
      const age = now - s.mtimeMs / 1000;
      if (age > STALE_AGE_SECONDS) {
        messages.push(`ctags index is ${Math.floor(age / 60)}min old — rebuild with: ctags -R .`);
      }
    } catch {}
  } else {
    messages.push("No ctags index — run: ctags -R --exclude=.git --exclude=node_modules .");
  }

  if (!(await exists("graphify-out"))) {
    messages.push("No graphify graph — run: graphify build .");
  }

  if (messages.length > 0) {
    process.stdout.write(messages.join("\n") + "\n");
  }
}
