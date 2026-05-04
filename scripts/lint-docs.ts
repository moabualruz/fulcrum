#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const requiredHeadings: Record<string, string[]> = {
  "GOVERNANCE.md": ["Mission", "Contribution Model", "Triage SLA", "Decision Process", "Path to v1.0"],
  "SECURITY.md": ["Responsible Disclosure", "Reporting Flow", "Embargo Timeline", "Security Surface Scope"],
  "CODE_OF_CONDUCT.md": ["Our Pledge", "Our Standards", "Enforcement Responsibilities", "Enforcement"],
  "VERSIONING.md": ["Semantic Versioning Policy", "Release Cadence", "Deprecation Policy", "v1.0 Readiness Criteria"],
};

const bannedText = /\b(TODO|TBD|your-email@example\.com|security@<domain>)\b/i;
const errors: string[] = [];

function readRootFile(path: string): string | undefined {
  const absPath = join(repoRoot, path);
  if (!existsSync(absPath)) {
    errors.push(`${path}: missing`);
    return undefined;
  }
  return readFileSync(absPath, "utf8");
}

for (const [path, headings] of Object.entries(requiredHeadings)) {
  const text = readRootFile(path);
  if (!text) continue;

  for (const heading of headings) {
    if (!text.includes(`## ${heading}`)) {
      errors.push(`${path}: missing heading "## ${heading}"`);
    }
  }

  if (bannedText.test(text)) {
    errors.push(`${path}: contains placeholder text`);
  }
}

const codeOfConduct = readRootFile("CODE_OF_CONDUCT.md");
if (codeOfConduct) {
  for (const phrase of [
    "# Contributor Covenant Code of Conduct",
    "Community Impact Guidelines",
    "version 2.1",
    "security@fulcrum.local",
  ]) {
    if (!codeOfConduct.includes(phrase)) {
      errors.push(`CODE_OF_CONDUCT.md: missing Contributor Covenant phrase "${phrase}"`);
    }
  }
}

for (const path of Object.keys(requiredHeadings)) {
  const text = readRootFile(path);
  if (text && !text.includes("security@fulcrum.local")) {
    errors.push(`${path}: missing security@fulcrum.local contact`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log("governance docs lint passed");
