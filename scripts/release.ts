#!/usr/bin/env bun
// Local release runner. No GitHub Actions involved — the user runs this
// from their machine when they're ready to cut a release.
//
// What it does (in order):
//   1. Verifies working tree is clean.
//   2. Verifies the tag (or --bump) doesn't already exist locally or on origin.
//   3. Runs `bun run ci` (full test/build gate). Bails if any step fails.
//   4. Updates CHANGELOG.md via `git-cliff --tag <tag>` (skipped if git-cliff missing).
//   5. Stages CHANGELOG.md, creates `chore(release): <tag>` commit.
//   6. Tags the commit (annotated, signed if user.signingkey is set).
//   7. Builds all 5 platform binaries via `bun run scripts/build-all.ts`.
//   8. (Optional, --gh) creates a GitHub release via `gh release create` and
//      uploads dist/* as assets.
//
// What it does NOT do:
//   - Push the commit or tag (you do that explicitly).
//   - Auto-bump versions in source (semver discipline is yours).
//
// Usage:
//   bun run scripts/release.ts v0.2.0          # cut v0.2.0 locally
//   bun run scripts/release.ts v0.2.0 --gh     # also create a GitHub release + upload
//   bun run scripts/release.ts --dry-run v0.2.0  # show what would happen
//
// After this completes:
//   git push origin <branch>
//   git push origin <tag>

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ghRelease = args.includes("--gh");
const tag = args.find((a) => !a.startsWith("--"));

if (!tag || !/^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(tag)) {
  console.error("usage: bun run scripts/release.ts vX.Y.Z[-suffix] [--gh] [--dry-run]");
  process.exit(2);
}

function run(cmd: string[], opts: { allowFail?: boolean; capture?: boolean } = {}): string {
  if (dryRun) console.log(`  [dry-run] ${cmd.join(" ")}`);
  const r = spawnSync(cmd[0]!, cmd.slice(1), {
    stdio: opts.capture ? ["ignore", "pipe", "inherit"] : (dryRun ? "ignore" : "inherit"),
    encoding: "utf8",
  });
  if (r.status !== 0 && !opts.allowFail && !dryRun) {
    console.error(`fail: ${cmd.join(" ")} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  return (r.stdout ?? "").trim();
}

function which(cmd: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;
}

console.log(`fulcrum release — ${tag}${dryRun ? " (DRY RUN)" : ""}\n`);

// 1. Clean tree
const status = run(["git", "status", "--porcelain"], { capture: true });
if (status && !dryRun) {
  console.error("working tree not clean. Commit or stash first.");
  console.error(status);
  process.exit(1);
}
console.log("✓ working tree clean");

// 2. Tag uniqueness
const localTags = run(["git", "tag", "--list", tag], { capture: true });
if (localTags.split(/\s+/).filter(Boolean).includes(tag)) {
  console.error(`tag ${tag} already exists locally`);
  process.exit(1);
}
const remoteTagLine = run(["git", "ls-remote", "--tags", "origin", tag], { capture: true, allowFail: true });
if (remoteTagLine.includes(`refs/tags/${tag}`)) {
  console.error(`tag ${tag} already exists on origin`);
  process.exit(1);
}
console.log(`✓ tag ${tag} is fresh`);

// 3. CI gate
console.log("\n→ running CI gate (bun run ci)\n");
run(["bun", "run", "ci"]);

console.log("\n→ running release-only content gates\n");
run(["bun", "run", "apps/cli/src/main.ts", "skills", "lint", "skills/"]);
run(["bash", "scripts/compress-with-caveman.sh", "--check"]);

// 4. CHANGELOG via git-cliff
console.log();
if (which("git-cliff")) {
  console.log(`→ updating CHANGELOG.md via git-cliff --tag ${tag}`);
  run(["git-cliff", "--tag", tag, "-o", "CHANGELOG.md"]);
} else {
  console.log("· git-cliff not installed — skipping CHANGELOG update (install: brew install git-cliff)");
}

// 5. Commit
const ch = run(["git", "diff", "--stat", "CHANGELOG.md"], { capture: true, allowFail: true });
if (ch && !dryRun) {
  run(["git", "add", "CHANGELOG.md"]);
  run(["git", "commit", "-m", `chore(release): ${tag}`]);
  console.log(`✓ release commit created`);
} else {
  console.log("· CHANGELOG unchanged — no release commit needed");
}

// 6. Tag
console.log(`\n→ tagging ${tag}`);
run(["git", "tag", "-a", tag, "-m", `Release ${tag}`]);

// 7. Build all
console.log("\n→ building all platform binaries\n");
run(["bun", "run", "scripts/build-all.ts"]);

// 8. Optional gh release
if (ghRelease) {
  if (!which("gh")) {
    console.error("\n--gh requested but `gh` is not on PATH. Install: brew install gh && gh auth login");
    process.exit(1);
  }
  console.log(`\n→ creating GitHub release ${tag} and uploading dist/*\n`);
  const dist = readdirSync("dist").filter((f) => statSync(`dist/${f}`).isFile()).map((f) => `dist/${f}`);
  run(["gh", "release", "create", tag, ...dist, "--title", tag, "--generate-notes"]);
  console.log("✓ release created on GitHub");
}

console.log("\n━━━ done ━━━");
console.log(`tag:    ${tag}`);
console.log(`next:   git push origin HEAD && git push origin ${tag}`);
if (!ghRelease) {
  console.log(`        # to publish a GitHub release after pushing:`);
  console.log(`        gh release create ${tag} dist/* --title ${tag} --generate-notes`);
}
