/**
 * KeyboardShortcuts — task workflow (D-67).
 *
 * Registers all global keyboard shortcuts using tinykeys.
 * Returns a cleanup function for use in onMount/onDestroy.
 *
 * Security: bindings are registered on document; input fields
 * suppress navigation shortcuts via tinykeys default behavior.
 */

import { tinykeys } from "tinykeys";

export interface ShortcutCallbacks {
  // Task navigation
  navigateDown?: () => void;
  navigateUp?: () => void;
  openPanel?: () => void;
  closePanel?: () => void;
  // Task actions
  createTask?: () => void;
  setStatus?: () => void;
  setAssignee?: () => void;
  setPriority?: () => void;
  addLabel?: () => void;
  moveToSprint?: () => void;
  toggleSelect?: () => void;
  addToCurrentSprint?: () => void;
  inlineEdit?: () => void;
  addFilter?: () => void;
  // View navigation
  goToBoard?: () => void;
  goToList?: () => void;
  goToGantt?: () => void;
  // System
  showHelp?: () => void;
  openCommandPalette?: () => void;
}

/**
 * Returns true when the event originated inside an editable element
 * (input, textarea, contenteditable). Used to suppress shortcuts.
 */
function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

function guard(cb: (() => void) | undefined, allowInEditable = false) {
  return (event: KeyboardEvent) => {
    if (!allowInEditable && isEditableTarget(event)) return;
    event.preventDefault();
    cb?.();
  };
}

/**
 * Register all global keyboard shortcuts.
 *
 * @param callbacks - Context-aware handlers from the mounting component.
 * @returns Cleanup function — call in onDestroy or effect cleanup.
 */
export function setupKeyboardShortcuts(
  callbacks: ShortcutCallbacks,
): () => void {
  return tinykeys(document, {
    // ── Task navigation ───────────────────────────────────────────────────
    j: guard(callbacks.navigateDown),
    k: guard(callbacks.navigateUp),
    Enter: guard(callbacks.openPanel),
    Escape: guard(callbacks.closePanel, true),

    // ── Task actions ──────────────────────────────────────────────────────
    c: guard(callbacks.createTask),
    s: guard(callbacks.setStatus),
    a: guard(callbacks.setAssignee),
    p: guard(callbacks.setPriority),
    l: guard(callbacks.addLabel),
    m: guard(callbacks.moveToSprint),
    x: guard(callbacks.toggleSelect),
    e: guard(callbacks.inlineEdit),
    f: guard(callbacks.addFilter),
    "Shift+C": guard(callbacks.addToCurrentSprint),

    // ── Help + command palette ─────────────────────────────────────────────
    "?": guard(callbacks.showHelp),
    "$mod+k": guard(callbacks.openCommandPalette, true),

    // ── View navigation (chord: g then b/l/g) ─────────────────────────────
    "g b": guard(callbacks.goToBoard),
    "g l": guard(callbacks.goToList),
    "g g": guard(callbacks.goToGantt),
  });
}
