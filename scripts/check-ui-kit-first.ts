#!/usr/bin/env bun
/**
 * ui-kit-first standing gate.
 *
 * AGENTS.md `@fulcrum/ui-kit` rule: every web/desktop surface composes existing
 * `@fulcrum/ui-kit` primitives — routes, feature components, CLI, and TUI never
 * re-implement a Button / Input / Select / Dialog / Toast / Tooltip / Badge /
 * Card / Avatar / etc. The rule was followed unevenly across 91 page-fidelity
 * PRDs because no gate caught route-local re-implementations. This script is
 * that gate.
 *
 * ── Heuristic (deliberately pragmatic — false positives are worse than a few
 *    false negatives for a standing gate) ──────────────────────────────────────
 *
 *   RULE 1 — Parallel primitive directory.
 *     No file outside `packages/ui-kit` may import from a parallel primitive
 *     barrel that shadows the ui-kit (`$lib/components/ui/...`,
 *     `lib/components/ui/...`). Such a directory is a second primitive source
 *     of truth — exactly the duplication this gate exists to prevent.
 *
 *   RULE 2 — Route / feature-local primitive re-implementation.
 *     A `.svelte` file under `apps/web/src/routes/` or
 *     `apps/web/src/lib/components/` whose *filename stem* matches a ui-kit
 *     primitive responsibility (Button, Dialog, Tooltip, …) is flagged UNLESS
 *     the file itself imports that responsibility from `@fulcrum/ui-kit` (i.e.
 *     it delegates / composes rather than re-implements). Feature-composite
 *     names ending in a primitive responsibility (e.g. `FacetChip`,
 *     `MetricCard`) are also flagged unless they delegate to ui-kit.
 *
 *   RULE 3 — Absorbed primitive responsibility marker.
 *     Some legacy demos do not use primitive filenames. If a surface declares a
 *     known absorbed primitive responsibility through stable data hooks and does
 *     not import `@fulcrum/ui-kit`, flag it. Keep these markers narrow so
 *     feature composites that merely contain comments, lists, or cards do not
 *     trip the standing gate.
 *
 * The scan is structural and deterministic: same input → same output. It reads
 * files only; it never mutates. Exit 0 = clean, exit 1 = violations.
 *
 * Usage: bun run scripts/check-ui-kit-first.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directories scanned for surface code. */
const SURFACE_ROOTS = [
  "apps/web/src/routes",
  "apps/web/src/lib/components",
  "apps/cli/src",
  "apps/tui/src",
];

/**
 * Import substrings that point at a parallel primitive barrel shadowing
 * `@fulcrum/ui-kit`. Any of these in a non-ui-kit file is a RULE 1 violation.
 */
const PARALLEL_PRIMITIVE_IMPORTS = [
  "$lib/components/ui/",
  "lib/components/ui/",
];

/**
 * ui-kit primitive responsibilities, keyed by the filename stem a route-local
 * re-implementation would use. A `.svelte` file whose stem (case-insensitive)
 * equals one of these is a RULE 2 candidate.
 */
const UI_KIT_PRIMITIVE_STEMS = new Set(
  [
    "button",
    "input",
    "textarea",
    "select",
    "checkbox",
    "switch",
    "toggle",
    "label",
    "dialog",
    "alertdialog",
    "alert-dialog",
    "sheet",
    "drawer",
    "popover",
    "tooltip",
    "dropdown",
    "dropdownmenu",
    "dropdown-menu",
    "contextmenu",
    "context-menu",
    "toast",
    "toaster",
    "badge",
    "statusbadge",
    "status-badge",
    "chip",
    "card",
    "avatar",
    "tabs",
    "breadcrumb",
    "pagination",
    "progress",
    "skeleton",
    "kbd",
    "combobox",
    "radiogroup",
    "radio-group",
    "stepper",
    "scrollarea",
    "scroll-area",
    "comment-thread",
  ].map((s) => s.toLowerCase()),
);

const UI_KIT_PRIMITIVE_SUFFIXES = [
  "sheet",
  "chip",
  "card",
  "stat",
  "badge",
] as const;

interface AbsorbedPrimitiveResponsibility {
  name: string;
  dataHooks: readonly string[];
  minimumHooks: number;
}

const ABSORBED_PRIMITIVE_RESPONSIBILITIES: AbsorbedPrimitiveResponsibility[] = [
  {
    name: "CommentThread",
    dataHooks: [
      "data-thread-panel",
      "data-thread-comments",
      "data-thread-comment",
      "data-thread-reply-input",
      "data-thread-reply",
      "data-thread-resolve",
      "data-thread-resolved",
      "data-thread-start",
    ],
    minimumHooks: 4,
  },
  {
    name: "Badge",
    dataHooks: [
      "data-routing-project-scope",
      "data-routing-global-scope",
      "data-routing-enabled-toggle",
    ],
    minimumHooks: 1,
  },
];

/**
 * Files explicitly allowed despite a primitive-matching stem. These are
 * feature-composite wrappers reviewed by the ui-kit-first audit and confirmed
 * to delegate to `@fulcrum/ui-kit` rather than re-implement. Keep this list
 * short and justified — every entry is migration debt or a reviewed exception.
 */
const ALLOWLIST = new Set<string>([
  // CommandPalette composes the ui-kit CommandPalette primitive; the route
  // shell wiring is feature-specific (keyboard routing, data sources).
  "apps/web/src/lib/components/command-palette/CommandPalette.svelte",
]);

interface Violation {
  file: string;
  rule: string;
  detail: string;
}

const violations: Violation[] = [];

function walk(dir: string, onFile: (abs: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // missing surface root (e.g. partial checkout) — skip silently.
  }
  for (const entry of entries) {
    const abs = join(dir, entry);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".svelte-kit") continue;
      walk(abs, onFile);
    } else {
      onFile(abs);
    }
  }
}

function stem(file: string): string {
  return basename(file)
    .replace(/\.(svelte|ts|tsx)$/i, "")
    .toLowerCase();
}

/** True if the file imports the given primitive name from `@fulcrum/ui-kit`. */
function importsUiKit(source: string): boolean {
  return /from\s+["']@fulcrum\/ui-kit["']/.test(source);
}

function absorbedPrimitiveResponsibility(
  source: string,
): AbsorbedPrimitiveResponsibility | undefined {
  return ABSORBED_PRIMITIVE_RESPONSIBILITIES.find((responsibility) => {
    const matches = responsibility.dataHooks.filter((hook) => source.includes(hook));
    return matches.length >= responsibility.minimumHooks;
  });
}

for (const rootRel of SURFACE_ROOTS) {
  const rootAbs = join(ROOT, rootRel);
  walk(rootAbs, (abs) => {
    const rel = relative(ROOT, abs);
    const isCode = /\.(svelte|ts|tsx)$/i.test(abs);
    if (!isCode) return;
    // Test files exercise components; they are not surface declarations.
    if (/\.(test|spec)\.[tj]sx?$/i.test(abs) || /\.svelte\.test\.ts$/i.test(abs)) return;

    const source = readFileSync(abs, "utf8");

    // ── RULE 1: parallel primitive barrel import ──
    for (const needle of PARALLEL_PRIMITIVE_IMPORTS) {
      if (source.includes(needle)) {
        violations.push({
          file: rel,
          rule: "parallel-primitive-import",
          detail: `imports from a parallel primitive barrel ("${needle}"); use @fulcrum/ui-kit instead`,
        });
        break;
      }
    }

    // ── RULE 2: route/feature-local primitive re-implementation ──
    if (abs.endsWith(".svelte")) {
      const s = stem(abs);
      if (UI_KIT_PRIMITIVE_STEMS.has(s) && !ALLOWLIST.has(rel)) {
        if (!importsUiKit(source)) {
          violations.push({
            file: rel,
            rule: "route-local-primitive",
            detail: `"${basename(abs)}" re-implements a ui-kit primitive without composing @fulcrum/ui-kit; extract to packages/ui-kit or compose the existing primitive`,
          });
        }
      }
      const suffix = UI_KIT_PRIMITIVE_SUFFIXES.find(
        (primitive) => s !== primitive && s.endsWith(primitive),
      );
      if (suffix && !importsUiKit(source) && !ALLOWLIST.has(rel)) {
        violations.push({
          file: rel,
          rule: "route-local-primitive-overlap",
          detail: `"${basename(abs)}" owns a ${suffix} primitive overlap without composing @fulcrum/ui-kit; use the existing primitive or extend packages/ui-kit`,
        });
      }

      // ── RULE 3: absorbed primitive responsibility without ui-kit composition ──
      const absorbed = absorbedPrimitiveResponsibility(source);
      if (absorbed && !importsUiKit(source) && !ALLOWLIST.has(rel)) {
        violations.push({
          file: rel,
          rule: "absorbed-primitive-responsibility",
          detail: `declares ${absorbed.name} data hooks without composing @fulcrum/ui-kit; replace route-local implementation with the ui-kit primitive`,
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error("ui-kit-first gate FAIL:\n");
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    [${v.rule}] ${v.detail}\n`);
  }
  console.error(
    `${violations.length} violation(s). See AGENTS.md "@fulcrum/ui-kit" rule.`,
  );
  process.exit(1);
}

console.log("ui-kit-first gate OK — no parallel primitives or route-local re-implementations.");
process.exit(0);
