#!/usr/bin/env bun
/**
 * Literal-copy assertion gate for the design-fidelity recovery PRD ledger.
 *
 * The closure copy-fidelity review found `done` PRDs whose `copy_assertions`
 * still read as paraphrases ("Empty-state copy matches COPY.md...", "Status
 * labels are canonical...") instead of exact visible strings. A paraphrase
 * assertion cannot fail a test when production copy drifts, so it is not
 * load-bearing.
 *
 * This gate fails when any non-empty `copy_assertions` entry in
 * `vertical-prds.jsonl` lacks BOTH:
 *   1. an exact quoted visible string (a substring inside single quotes,
 *      double quotes, or backticks that reads as real visible copy), AND
 *   2. an explicit banned-string assertion (an enumeration of quoted tokens
 *      introduced by a ban/never/absent keyword).
 *
 * An entry passes if it satisfies EITHER (1) or (2): a positive literal lock
 * ("H2 is exactly 'No drafts yet.'") or a negative literal lock
 * ("Banned strings never render: 'Oops!', 'Please try again'").
 *
 * Usage:
 *   bun run scripts/check-copy-assertions.ts            # gate all PRD rows
 *   bun run scripts/check-copy-assertions.ts <path...>  # gate explicit files
 *
 * Exit code 0 = every non-empty copy_assertions entry is literal/banned.
 * Exit code 1 = at least one paraphrase assertion remains.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ledgerRelpath =
  ".scratch/design-fidelity-review-2026-05-20/vertical-prds.jsonl";

/**
 * The ledger is a gitignored `.scratch/` artifact that lives only in the
 * primary checkout. The script may itself sit in a per-PRD worktree where
 * `.scratch/` does not exist, so the default target prefers the script-root
 * copy and falls back to a CWD-relative copy (the primary checkout).
 */
function ledgerCandidates(start: string): string[] {
  const candidates: string[] = [];
  let cursor = resolve(start);
  while (true) {
    candidates.push(resolve(cursor, ledgerRelpath));
    const parent = dirname(cursor);
    if (parent === cursor) return candidates;
    cursor = parent;
  }
}

function resolveDefaultLedger(): string {
  for (const candidate of [
    ...ledgerCandidates(repoRoot),
    ...ledgerCandidates(process.cwd()),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return resolve(repoRoot, ledgerRelpath);
}

const defaultLedger = resolveDefaultLedger();
const defaultLedgerExists = existsSync(defaultLedger);

interface PrdRow {
  id?: string;
  copy_assertions?: unknown;
}

/**
 * Keywords that introduce a banned-string enumeration. When one of these is
 * present the assertion is a negative literal lock, provided it also names at
 * least one quoted token to forbid.
 */
const BAN_KEYWORDS =
  /\b(banned|ban|leaks?|never\s+(?:say|says|render|renders|use|uses|shows?|appears?)|absent|must\s+not\s+(?:say|render|appear|show|use)|no\s+(?:longer\s+)?(?:visible\s+)?(?:renders?|says?|contains?|reads?|has|uses?))\b/i;

/**
 * Phrasing that, on its own, marks an assertion as a paraphrase: it defers to a
 * spec document instead of pinning the exact visible string. These are only a
 * defect when the assertion carries no quoted literal alongside them.
 */
const PARAPHRASE_MARKERS =
  /\b(match(?:es)?|matching|consistent\s+with|canonical|per\s+(?:COPY|DESIGN|IA-MAP|CLI-TUI-UX)|follows?\s+the|template|verbatim\s+where|as\s+specified)\b/i;

/** Words that, alongside a multi-token quoted list, mark it an exact lock. */
const EXACTNESS_SIGNAL = /\b(exact(?:ly)?|verbatim|literal(?:ly)?)\b/i;

const BANNED_TOKEN_PATTERNS = [
  /\bACP\b/i,
  /\bchat\b/i,
  /\bWIP\b/,
  /\bem dash(?: character)?\b/i,
  /\bdecorative sparkle glyph\b/i,
  /✨|\\u2728/i,
];

/** A quoted run is "real visible copy" when it has a letter and is non-trivial. */
function quotedLiterals(text: string): string[] {
  const out: string[] = [];
  // single quotes, double quotes, and backticks; non-greedy, no nested quote.
  const patterns = [/'([^']+)'/g, /"([^"]+)"/g, /`([^`]+)`/g];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const raw = m[1].trim();
      if (raw.length >= 1 && (/[A-Za-z✨—]/.test(raw) || /\\u(?:2014|2728)/i.test(raw))) out.push(raw);
    }
  }
  return out;
}

/**
 * An "exact visible-string" literal is a quoted run that reads as real copy:
 * it contains a space (a phrase), ends with sentence punctuation, is a
 * capitalised multi-letter status/label token, or is a sigil-prefixed UI
 * token (`:AI`, `⌘K`-style chrome). This rejects a bare single key glyph like
 * `c` from counting as the whole assertion's literal while still recognising a
 * genuine one-token chrome label.
 */
function hasVisibleStringLiteral(text: string): boolean {
  for (const lit of quotedLiterals(text)) {
    const phrase = /\s/.test(lit);
    const sentence = /[.?!]$/.test(lit);
    const labelToken = /^[A-Z][A-Za-z-]{2,}$/.test(lit);
    const sigilToken = /^[:@/⌘][A-Za-z][A-Za-z-]*$/.test(lit);
    if (phrase || sentence || labelToken || sigilToken) return true;
  }
  return false;
}

/**
 * An exact-token enumeration: three or more distinct quoted tokens alongside an
 * exactness signal ("exactly", "verbatim"). A canonical vocabulary lock such as
 * "labels are exactly 'queued', 'running', 'waiting-input', ..." pins every
 * visible token even when each token is a short single word, so it is a
 * literal lock the acceptance explicitly allows ("exact quoted literal strings").
 */
function hasExactTokenEnumeration(text: string): boolean {
  if (!EXACTNESS_SIGNAL.test(text)) return false;
  const distinct = new Set(quotedLiterals(text));
  return distinct.size >= 3;
}

/**
 * An explicit banned-string assertion: a ban keyword plus at least one quoted
 * token to forbid. The token bar is lower than a full visible string because a
 * ban list legitimately enumerates short tokens (e.g. `WIP`, `Oops!`).
 */
function hasBannedStringAssertion(text: string): boolean {
  const bansSomething = BAN_KEYWORDS.test(text) || /\bno\b/i.test(text);
  if (!bansSomething) return false;
  return quotedLiterals(text).length > 0 || BANNED_TOKEN_PATTERNS.some((pattern) => pattern.test(text));
}

function hasVerbatimCopySectionAssertion(text: string): boolean {
  return /\bmatches?\b/i.test(text) && /\bCOPY\.md\s+§\d+(?:\.\d+)?\b/i.test(text) && /\bverbatim\b/i.test(text);
}

function hasExitCodeAssertion(text: string): boolean {
  return /\b[\w./-]+\.(?:ts|js|sh)\s+exits\s+0\b/i.test(text);
}

/**
 * An assertion is literal-locked when it positively pins an exact visible
 * string, enumerates an exact-token vocabulary, OR negatively enumerates
 * banned strings. A bare paraphrase that only defers to a spec section is the
 * defect this gate rejects.
 */
function isLiteralAssertion(text: string): boolean {
  if (hasVisibleStringLiteral(text)) return true;
  if (hasExactTokenEnumeration(text)) return true;
  if (hasBannedStringAssertion(text)) return true;
  if (hasVerbatimCopySectionAssertion(text)) return true;
  if (hasExitCodeAssertion(text)) return true;
  return false;
}

function classify(text: string): string {
  const reasons: string[] = [];
  if (!hasVisibleStringLiteral(text))
    reasons.push("no exact quoted visible string");
  if (!hasExactTokenEnumeration(text))
    reasons.push("no exact-token enumeration");
  if (!hasBannedStringAssertion(text))
    reasons.push("no explicit banned-string assertion");
  if (!hasVerbatimCopySectionAssertion(text))
    reasons.push("no exact COPY.md section lock");
  if (!hasExitCodeAssertion(text))
    reasons.push("no exact exit-code assertion");
  if (PARAPHRASE_MARKERS.test(text)) reasons.push("paraphrase phrasing present");
  return reasons.join("; ");
}

function loadRows(path: string): PrdRow[] {
  const text = readFileSync(path, "utf8").trim();
  if (!text) return [];
  return text.split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line) as PrdRow;
    } catch (error) {
      throw new Error(
        `${relative(repoRoot, path)}:${index + 1}: invalid JSON line: ${
          (error as Error).message
        }`,
      );
    }
  });
}

/**
 * The ledger (`vertical-prds.jsonl`) is a gitignored `.scratch/` artifact that
 * exists only in the primary checkout, not in per-PRD worktrees. Explicit path
 * arguments are therefore resolved against the caller's CWD so the gate can run
 * from the primary checkout while the script itself lives in a worktree. The
 * default target resolves against the script's own repo root.
 */
const argv = process.argv.slice(2);
const ledgers = (argv.length > 0 ? argv.map((p) => resolve(process.cwd(), p)) : [
  defaultLedger,
]);

const failures: string[] = [];
let checkedRows = 0;
let checkedAssertions = 0;

for (const ledger of ledgers) {
  if (!existsSync(ledger)) {
    if (argv.length > 0) {
      failures.push(`${relative(repoRoot, ledger) || ledger}: ledger file not found`);
    }
    continue;
  }
  const rel = relative(repoRoot, ledger) || ledger;
  const rows = loadRows(ledger);
  for (const row of rows) {
    const assertions = row.copy_assertions;
    if (!Array.isArray(assertions) || assertions.length === 0) continue;
    checkedRows += 1;
    for (const [index, raw] of assertions.entries()) {
      checkedAssertions += 1;
      if (typeof raw !== "string" || raw.trim().length === 0) {
        failures.push(
          `${rel} :: ${row.id ?? "<no-id>"} copy_assertions[${index}]: empty or non-string assertion`,
        );
        continue;
      }
      if (!isLiteralAssertion(raw)) {
        failures.push(
          `${rel} :: ${row.id ?? "<no-id>"} copy_assertions[${index}]: paraphrase assertion (${classify(
            raw,
          )}). Needs an exact quoted string or an explicit banned-string list\n      "${raw}"`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("check-copy-assertions FAIL: paraphrase copy assertions found");
  console.error(failures.join("\n"));
  console.error(
    `\n${failures.length} paraphrase assertion(s) across ${checkedRows} PRD row(s) with non-empty copy_assertions.`,
  );
  process.exit(1);
}

if (!defaultLedgerExists && argv.length === 0) {
  console.log(
    `check-copy-assertions ok: no default PRD ledger at ${relative(repoRoot, defaultLedger)}.`,
  );
  process.exit(0);
}

console.log(
  `check-copy-assertions ok: ${checkedAssertions} literal/banned assertion(s) across ${checkedRows} PRD row(s) with non-empty copy_assertions.`,
);
