#!/usr/bin/env bun

// Asserts the design-reference manifest agrees with the PRD ledger. Any
// actionable OD/spec reference owned by vertical-prds.jsonl must include every
// JSONL owner in the manifest owner cell, and cannot remain a manifest GAP.
// Named-but-missing ids in the Actionable table are also rejected.
//
// This backs Closure Gate check 1 (the gate parses the same section) and the
// consumed-by verify of prd-closure6-manifest-resolved-table.

import { existsSync, readFileSync } from "node:fs";

const ROOT = ".scratch/design-fidelity-review-2026-05-20";
const MANIFEST = `${ROOT}/design-reference-manifest.md`;
const LEDGER = `${ROOT}/vertical-prds.jsonl`;

type LedgerEntry = {
  id: string;
  od_examples?: string[];
  design_refs?: string[];
  source_specs?: string[];
};

type ManifestRow = {
  line: number;
  section: "od" | "spec";
  reference: string;
  detail: string;
  owners: string[];
  status: string;
};

const worktreeMarker = "/.claude/worktrees/";
const mainCheckoutRoot = process.cwd().includes(worktreeMarker)
  ? process.cwd().split(worktreeMarker)[0]
  : process.cwd();
const fallbackRoot = `${mainCheckoutRoot}/${ROOT}`;
const manifestPath = existsSync(MANIFEST)
  ? MANIFEST
  : `${fallbackRoot}/design-reference-manifest.md`;
const ledgerPath = existsSync(LEDGER) ? LEDGER : `${fallbackRoot}/vertical-prds.jsonl`;

const manifest = readFileSync(manifestPath, "utf8");
const ledgerEntries = readFileSync(ledgerPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as LedgerEntry);
const ledgerIds = new Set(ledgerEntries.map((entry) => entry.id));

const ownersByReference = new Map<string, Set<string>>();

function addOwner(reference: string, owner: string) {
  const normalized = normalizeReference(reference);
  if (!normalized) return;

  const owners = ownersByReference.get(normalized) ?? new Set<string>();
  owners.add(owner);
  ownersByReference.set(normalized, owners);
}

for (const entry of ledgerEntries) {
  for (const reference of entry.od_examples ?? []) addOwner(reference, entry.id);
  for (const reference of entry.design_refs ?? []) addOwner(reference, entry.id);
  for (const reference of entry.source_specs ?? []) addOwner(reference, entry.id);
}

function normalizeReference(value: string) {
  return value
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.scratch\/od-iterations\/[^/]+\/files\//, "")
    .trim();
}

function splitMarkdownRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function extractOwners(value: string) {
  return [...value.matchAll(/`(prd-[a-z0-9-]+)`/g)].map((match) => match[1]);
}

function ledgerOwnersFor(row: ManifestRow) {
  const candidateOwners = new Set<string>();
  const normalizedReference = normalizeReference(row.reference);
  const exactOwners = ownersByReference.get(normalizedReference);

  for (const owner of exactOwners ?? []) candidateOwners.add(owner);

  if (row.section === "spec") {
    const specPrefix = normalizeReference(`${row.reference} ${row.detail}`);

    for (const [reference, owners] of ownersByReference) {
      if (
        reference === normalizedReference ||
        reference.startsWith(`${normalizedReference} `) ||
        reference === specPrefix ||
        reference.startsWith(`${specPrefix} `)
      ) {
        for (const owner of owners) candidateOwners.add(owner);
      }
    }
  }

  return [...candidateOwners].sort();
}

function parseManifestRows() {
  const rows: ManifestRow[] = [];
  let mode: "od" | "spec" | null = null;
  let specFile: string | null = null;

  manifest.split("\n").forEach((line, index) => {
    if (line.startsWith("## 1. OD HTML file coverage")) mode = "od";
    if (line.startsWith("## 2. Spec section coverage")) mode = "spec";
    if (line.startsWith("## 3.")) mode = null;

    if (mode === "spec") {
      const specHeading = line.match(/^### (.+\.md)$/);
      if (specHeading) specFile = specHeading[1];
    }

    if (!line.startsWith("|") || line.includes("---")) return;

    const cells = splitMarkdownRow(line);
    if (mode === "od" && cells.length >= 4 && cells[0] !== "OD file") {
      rows.push({
        line: index + 1,
        section: "od",
        reference: normalizeReference(cells[0]),
        detail: cells[1],
        owners: extractOwners(cells[2]),
        status: cells[3],
      });
    }

    if (mode === "spec" && specFile && cells.length >= 4 && cells[0] !== "§") {
      rows.push({
        line: index + 1,
        section: "spec",
        reference: normalizeReference(`${specFile} ${cells[0]}`),
        detail: cells[1],
        owners: extractOwners(cells[2]),
        status: cells[3],
      });
    }
  });

  return rows;
}

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

const rowFailures = parseManifestRows().flatMap((row) => {
  const expectedOwners = ledgerOwnersFor(row);
  if (expectedOwners.length === 0) return [];

  const missingOwners = expectedOwners.filter((owner) => !row.owners.includes(owner));
  const isGap = /\bGAP\b/i.test(row.status);
  const isDeferredUnowned = /deferred/i.test(row.status) && row.owners.length === 0;

  if (missingOwners.length === 0 && !isGap && !isDeferredUnowned) return [];

  const reasons = [];
  if (missingOwners.length > 0) reasons.push(`missing owners: ${missingOwners.join(", ")}`);
  if (isGap) reasons.push("still marked GAP");
  if (isDeferredUnowned) reasons.push("still marked deferred without owner");

  return [`line ${row.line} ${row.reference}: ${reasons.join("; ")}`];
});

if (rowFailures.length > 0) {
  console.error("check-manifest-gaps FAIL: manifest ownership disagrees with vertical-prds.jsonl");
  for (const failure of rowFailures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `check-manifest-gaps ok: ${parseManifestRows().length} manifest rows agree with vertical-prds.jsonl; all ${suggested.length} manifest-named PRD ids exist in the ledger`,
);
