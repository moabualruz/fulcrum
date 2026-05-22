#!/usr/bin/env bun

// Asserts the design-reference manifest's gap section agrees with the PRD
// ledger: every `prd-*` id named in the "### Actionable" section of
// design-reference-manifest.md must exist as a real entry in
// vertical-prds.jsonl. A named-but-missing id means the manifest claims a gap
// the ledger does not own — a stale manifest. Exit non-zero on disagreement.
//
// This backs Closure Gate check 1 (the gate parses the same section) and the
// consumed-by verify of prd-closure6-manifest-resolved-table.

import { readFileSync } from "node:fs";

const ROOT = ".scratch/design-fidelity-review-2026-05-20";
const MANIFEST = `${ROOT}/design-reference-manifest.md`;
const LEDGER = `${ROOT}/vertical-prds.jsonl`;

const manifest = readFileSync(MANIFEST, "utf8");
const ledgerIds = new Set(
  readFileSync(LEDGER, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).id as string),
);

const section = manifest.split("### Actionable")[1] ?? "";
if (!section) {
  console.error("check-manifest-gaps: manifest has no '### Actionable' section");
  process.exit(1);
}

const suggested = [...section.matchAll(/`(prd-[a-z0-9-]+)`/g)].map((m) => m[1]);
const missing = suggested.filter((id) => !ledgerIds.has(id));

if (missing.length > 0) {
  console.error(
    "check-manifest-gaps FAIL: manifest names PRD ids absent from vertical-prds.jsonl:",
    missing,
  );
  process.exit(1);
}

console.log(
  `check-manifest-gaps ok: all ${suggested.length} manifest-named PRD ids exist in the ledger`,
);
