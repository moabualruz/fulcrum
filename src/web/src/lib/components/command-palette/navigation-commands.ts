/**
 * Command definitions for Cmd+K palette.
 *
 * D-20/D-21/D-22: navigation, creation, and bulk action commands.
 * Bulk commands require items in selectedTaskIds store to appear.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaletteCommand {
  id: string;
  label: string;
  section: "Navigation" | "Create" | "Bulk Actions";
  icon: string;
  action?: () => void | Promise<void>;
  /** When true, command only shows when selectedTaskIds has entries */
  requiresSelection?: boolean;
}

async function navigate(path: string): Promise<void> {
  const { goto } = await import("$app/navigation");
  await goto(path);
}

// ── Navigation commands ───────────────────────────────────────────────────────

export const NAVIGATION_COMMANDS: PaletteCommand[] = [
  {
    id: "nav-home",
    label: "Go to Dashboard",
    section: "Navigation",
    icon: "home",
    action: () => navigate("/"),
  },
  {
    id: "nav-projects",
    label: "Go to Projects",
    section: "Navigation",
    icon: "folder",
    action: () => navigate("/projects"),
  },
  {
    id: "nav-docs",
    label: "Go to Documents",
    section: "Navigation",
    icon: "file-text",
    action: () => navigate("/docs"),
  },
  {
    id: "nav-boards",
    label: "Go to Boards",
    section: "Navigation",
    icon: "layout",
    action: () => navigate("/boards"),
  },
  {
    id: "nav-search",
    label: "Go to Search",
    section: "Navigation",
    icon: "search",
    action: () => navigate("/search"),
  },
  {
    id: "nav-memory",
    label: "Go to Memory",
    section: "Navigation",
    icon: "brain",
    action: () => navigate("/memory"),
  },
  {
    id: "nav-settings",
    label: "Go to Settings",
    section: "Navigation",
    icon: "settings",
    action: () => navigate("/settings/inference"),
  },
  {
    id: "nav-runs",
    label: "Go to Agent Runs",
    section: "Navigation",
    icon: "activity",
    action: () => navigate("/runs"),
  },
];

// ── Creation commands ─────────────────────────────────────────────────────────

export const CREATION_COMMANDS: PaletteCommand[] = [
  {
    id: "create-task",
    label: "New Task",
    section: "Create",
    icon: "square-check",
    action: () => navigate("/boards"),
  },
  {
    id: "create-doc",
    label: "New Doc",
    section: "Create",
    icon: "file-plus",
    action: () => navigate("/docs/new"),
  },
];

// ── Bulk action commands ──────────────────────────────────────────────────────

export const BULK_COMMANDS: PaletteCommand[] = [
  {
    id: "bulk-assign",
    label: "Assign Selected",
    section: "Bulk Actions",
    icon: "user-plus",
    requiresSelection: true,
  },
  {
    id: "bulk-status",
    label: "Change Status",
    section: "Bulk Actions",
    icon: "circle",
    requiresSelection: true,
  },
  {
    id: "bulk-move",
    label: "Move to Project",
    section: "Bulk Actions",
    icon: "move",
    requiresSelection: true,
  },
  {
    id: "bulk-label",
    label: "Add Label",
    section: "Bulk Actions",
    icon: "tag",
    requiresSelection: true,
  },
  {
    id: "bulk-sprint",
    label: "Move to Sprint",
    section: "Bulk Actions",
    icon: "zap",
    requiresSelection: true,
  },
  {
    id: "bulk-delete",
    label: "Delete Selected",
    section: "Bulk Actions",
    icon: "trash-2",
    requiresSelection: true,
  },
];

// ── All commands (non-bulk, for static display) ───────────────────────────────

export const ALL_COMMANDS: PaletteCommand[] = [
  ...NAVIGATION_COMMANDS,
  ...CREATION_COMMANDS,
  ...BULK_COMMANDS,
];
