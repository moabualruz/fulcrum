import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PHASES = ["01", "02", "03", "04", "05", "06", "07", "08", "09"] as const;

type PhaseEvidence = {
  phase: string;
  planHasTdd: boolean;
  summaryHasRedGreen: boolean;
  commitHasRedBeforeGreen: boolean;
  validationWaiver: boolean;
};

function phaseDir(phase: string): string {
  const dir = readdirSync(".planning/phases").find((entry) => entry.startsWith(`${phase}-`));
  if (!dir) throw new Error(`missing phase directory for ${phase}`);
  return join(".planning/phases", dir);
}

function files(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return files(path);
    return [path];
  });
}

function readMatching(root: string, match: RegExp): string {
  return files(root)
    .filter((file) => match.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function gitLog(): string[] {
  return execFileSync("git", ["log", "--reverse", "--oneline", "--all"], {
    encoding: "utf8",
  }).trim().split("\n");
}

function phaseCommitRegex(phase: string, kind: "test" | "green"): RegExp {
  const escaped = phase.replace(/^0/, "0?");
  const greenTypes = "(feat|fix|refactor|ci)";
  return kind === "test"
    ? new RegExp(`\\btest\\([^)]*${escaped}|\\btest\\(${escaped}|\\b${escaped}[^\\n]*RED`, "i")
    : new RegExp(`\\b${greenTypes}\\([^)]*${escaped}|\\b${greenTypes}\\(${escaped}`, "i");
}

function hasRedBeforeGreen(phase: string, log: string[]): boolean {
  const testRe = phaseCommitRegex(phase, "test");
  const greenRe = phaseCommitRegex(phase, "green");
  const firstTest = log.findIndex((line) => testRe.test(line));
  const firstGreen = log.findIndex((line) => greenRe.test(line));

  return firstTest >= 0 && firstGreen >= 0 && firstTest < firstGreen;
}

function evidenceFor(phase: string, log: string[]): PhaseEvidence {
  const root = phaseDir(phase);
  const plans = readMatching(root, /-PLAN\.md$/);
  const summaries = readMatching(root, /-SUMMARY\.md$/);
  const validation = readMatching(root, /(UAT|VALIDATION|VERIFICATION)\.md$/);
  const planHasTdd = /tdd="true"|RED/i.test(plans);
  const summaryHasRedGreen = /RED/i.test(summaries) && /GREEN/i.test(summaries);
  const validationWaiver =
    /TDD/i.test(validation) && /(not applicable|waiver|historical|manual verification|test coverage)/i.test(validation);

  return {
    phase,
    planHasTdd,
    summaryHasRedGreen,
    commitHasRedBeforeGreen: hasRedBeforeGreen(phase, log),
    validationWaiver,
  };
}

function remediation(evidence: PhaseEvidence): string {
  return [
    `Phase ${evidence.phase}: missing RED/GREEN TDD evidence.`,
    "Remediate by adding a RED test commit before implementation,",
    "or updating the phase SUMMARY with RED and GREEN command evidence,",
    "or documenting a specific UAT/VALIDATION waiver when TDD is not applicable.",
  ].join(" ");
}

describe("Phase RED-to-GREEN TDD evidence gate", () => {
  test("phases 01 through 09 have RED before GREEN evidence or documented waiver", () => {
    if (!existsSync(".planning/phases")) return;

    const log = gitLog();
    const missing = PHASES
      .map((phase) => evidenceFor(phase, log))
      .filter((evidence) =>
        !(evidence.planHasTdd && evidence.summaryHasRedGreen) &&
        !evidence.commitHasRedBeforeGreen &&
        !evidence.validationWaiver
      )
      .map(remediation);

    expect(missing).toEqual([]);
  });
});
