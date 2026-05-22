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
 *   RULE 4 — Native Select responsibility.
 *     A route / feature `.svelte` file that renders a visible native `<select>`
 *     or owns a listbox surface is re-implementing the ui-kit Select
 *     responsibility unless it imports `Select` from `@fulcrum/ui-kit`.
 *
 * The scan is structural and deterministic: same input → same output. It reads
 * files only; it never mutates. Exit 0 = clean, exit 1 = violations.
 *
 * Usage: bun run scripts/check-ui-kit-first.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.UI_KIT_FIRST_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");

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

const LEGACY_NATIVE_SELECT_ALLOWLIST = new Set<string>([
  "apps/web/src/routes/agents/+page.svelte",
  "apps/web/src/routes/boards/+page.svelte",
  "apps/web/src/routes/build-runs/+page.svelte",
  "apps/web/src/routes/comments/+page.svelte",
  "apps/web/src/routes/context/preview/+page.svelte",
  "apps/web/src/routes/cross-cutting-perf/+page.svelte",
  "apps/web/src/routes/doc-labels/+page.svelte",
  "apps/web/src/routes/docs/+page.svelte",
  "apps/web/src/routes/docs/[id]/edit/+page.svelte",
  "apps/web/src/routes/docs/new/+page.svelte",
  "apps/web/src/routes/inference/+page.svelte",
  "apps/web/src/routes/member-remove/+page.svelte",
  "apps/web/src/routes/members/+page.svelte",
  "apps/web/src/routes/memory/+page.svelte",
  "apps/web/src/routes/memory/[id]/+page.svelte",
  "apps/web/src/routes/operate-mcp/+page.svelte",
  "apps/web/src/routes/orchestration/+page.svelte",
  "apps/web/src/routes/project-settings/+page.svelte",
  "apps/web/src/routes/projects/+page.svelte",
  "apps/web/src/routes/projects/[id]/activity/+page.svelte",
  "apps/web/src/routes/projects/[id]/backlog/+page.svelte",
  "apps/web/src/routes/projects/[id]/board/+page.svelte",
  "apps/web/src/routes/projects/[id]/e2e/+page.svelte",
  "apps/web/src/routes/projects/[id]/gantt/+page.svelte",
  "apps/web/src/routes/projects/[id]/intake/[intakeId]/+page.svelte",
  "apps/web/src/routes/projects/[id]/modules/+page.svelte",
  "apps/web/src/routes/projects/[id]/modules/[moduleId]/+page.svelte",
  "apps/web/src/routes/projects/[id]/reports/+page.svelte",
  "apps/web/src/routes/projects/[id]/review/+page.svelte",
  "apps/web/src/routes/projects/[id]/runs/[runId]/+page.svelte",
  "apps/web/src/routes/projects/[id]/settings/fields/+page.svelte",
  "apps/web/src/routes/projects/[id]/settings/import/+page.svelte",
  "apps/web/src/routes/projects/[id]/settings/views/+page.svelte",
  "apps/web/src/routes/projects/[id]/settings/views/[viewId]/+page.svelte",
  "apps/web/src/routes/projects/[id]/updates/+page.svelte",
  "apps/web/src/routes/review/+page.svelte",
  "apps/web/src/routes/review/[reviewId]/+page.svelte",
  "apps/web/src/routes/review-search/+page.svelte",
  "apps/web/src/routes/review-templates/+page.svelte",
  "apps/web/src/routes/runs/+page.svelte",
  "apps/web/src/routes/settings/ai-assist/+page.svelte",
  "apps/web/src/routes/settings/i18n/+page.svelte",
  "apps/web/src/routes/settings/notifications/+page.svelte",
  "apps/web/src/routes/settings/routing/RoutingPage.svelte",
  "apps/web/src/routes/settings/theme/+page.svelte",
  "apps/web/src/routes/settings/users/+page.svelte",
  "apps/web/src/routes/skill-registry/+page.svelte",
  "apps/web/src/routes/space-permissions/+page.svelte",
  "apps/web/src/routes/task-filters/+page.svelte",
  "apps/web/src/routes/tasks/[id]/+page.svelte",
  "apps/web/src/routes/theme-picker/+page.svelte",
  "apps/web/src/routes/view-controls/+page.svelte",
  "apps/web/src/routes/views-custom-fields/+page.svelte",
  "apps/web/src/lib/components/agents/AgentSessionWorkbench.svelte",
  "apps/web/src/lib/components/board/BoardSheet.svelte",
  "apps/web/src/lib/components/board/KanbanBoard.svelte",
  "apps/web/src/lib/components/board/ListView.svelte",
  "apps/web/src/lib/components/board/SpreadsheetView.svelte",
  "apps/web/src/lib/components/docs/DocTemplatesManager.svelte",
  "apps/web/src/lib/components/docs/FrontmatterForm.svelte",
  "apps/web/src/lib/components/editor/DocEditor.svelte",
  "apps/web/src/lib/components/projects/ProjectForm.svelte",
  "apps/web/src/lib/components/repos/BranchSelector.svelte",
  "apps/web/src/lib/components/review/ReviewWorkbench.svelte",
  "apps/web/src/lib/components/saved-views/SavedViewFilterBuilder.svelte",
  "apps/web/src/lib/components/tasks/AutomationRuleList.svelte",
  "apps/web/src/lib/components/tasks/FieldDependencyConfig.svelte",
  "apps/web/src/lib/components/tasks/GanttView.svelte",
  "apps/web/src/lib/components/tasks/MentionSuggestion.svelte",
  "apps/web/src/lib/components/tasks/QuickCreateForm.svelte",
  "apps/web/src/lib/components/tasks/RecurrenceConfig.svelte",
  "apps/web/src/lib/components/tasks/TaskBoard.svelte",
  "apps/web/src/lib/components/tasks/TaskListView.svelte",
  "apps/web/src/lib/components/tasks/TaskTable.svelte",
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

function importedUiKitNames(source: string): Set<string> {
  const names = new Set<string>();
  const importPattern = /import\s*\{([^}]*)\}\s*from\s+["']@fulcrum\/ui-kit["']/g;
  for (const match of source.matchAll(importPattern)) {
    for (const specifier of match[1].split(",")) {
      const imported = specifier.trim().split(/\s+as\s+/i)[0]?.trim();
      if (imported) names.add(imported);
    }
  }
  return names;
}

function missingUiKitImports(source: string, required: readonly string[]): string[] {
  const imported = importedUiKitNames(source);
  return required.filter((name) => !imported.has(name));
}

function hasNativeSelectResponsibility(source: string): boolean {
  return /<select\b/i.test(source) || /\brole\s*=\s*["']listbox["']/i.test(source);
}

const REQUIRED_PRIMITIVE_COMPOSITION: Record<string, readonly string[]> = {
  "apps/web/src/lib/components/board/BoardSheet.svelte": [
    "Sheet",
    "SheetContent",
    "SheetHeader",
    "SheetTitle",
    "SheetFooter",
  ],
  "apps/web/src/routes/settings/routing/RoutingPage.svelte": [
    "Tabs",
    "TabsList",
    "TabsTrigger",
    "Button",
    "Input",
    "Textarea",
    "Switch",
    "Card",
    "Badge",
  ],
};

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
      const requiredPrimitives = REQUIRED_PRIMITIVE_COMPOSITION[rel];
      if (requiredPrimitives) {
        const missing = missingUiKitImports(source, requiredPrimitives);
        if (missing.length > 0) {
          violations.push({
            file: rel,
            rule: "incomplete-ui-kit-composition",
            detail: `must compose ui-kit primitive responsibilities: missing ${missing.join(", ")}`,
          });
        }
      }
      if (rel.endsWith("BoardSheet.svelte")) {
        if (!source.includes("<SheetContent")) {
          violations.push({
            file: rel,
            rule: "sheet-content-composition",
            detail: "sheet surfaces must render SheetContent, not only import a root Sheet state primitive",
          });
        }
        if (/<aside\b/.test(source)) {
          violations.push({
            file: rel,
            rule: "sheet-panel-reimplementation",
            detail: "sheet surfaces must not hand-roll an <aside> drawer panel; use ui-kit SheetContent",
          });
        }
      }
      if (
        hasNativeSelectResponsibility(source) &&
        missingUiKitImports(source, ["Select"]).length > 0 &&
        !LEGACY_NATIVE_SELECT_ALLOWLIST.has(rel)
      ) {
        violations.push({
          file: rel,
          rule: "native-select-reimplementation",
          detail: "renders a native select/listbox without composing @fulcrum/ui-kit Select",
        });
      }
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
