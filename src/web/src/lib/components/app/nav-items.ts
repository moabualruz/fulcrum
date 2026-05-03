import type { Component } from "svelte";

import Activity from "@lucide/svelte/icons/activity";
import Bot from "@lucide/svelte/icons/bot";
import FileText from "@lucide/svelte/icons/file-text";
import Folder from "@lucide/svelte/icons/folder";
import Kanban from "@lucide/svelte/icons/kanban";
import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
import Search from "@lucide/svelte/icons/search";
import Settings from "@lucide/svelte/icons/settings";
import Workflow from "@lucide/svelte/icons/workflow";

// Co-located lookup so tests can snapshot the icon surface without dragging
// every Svelte component into the suite. Keys MUST match `NavItem.iconName`.
export const LUCIDE_ICONS = {
  Activity,
  Bot,
  FileText,
  Folder,
  Kanban,
  LayoutDashboard,
  Search,
  Settings,
  Workflow,
} as const satisfies Record<string, Component>;

export type LucideIconName = keyof typeof LUCIDE_ICONS;

export interface NavItem {
  /** Absolute path the link routes to (always begins with "/"). */
  href: string;
  /** Visible text rendered next to the icon. */
  label: string;
  /** Lookup key into `LUCIDE_ICONS`. */
  iconName: LucideIconName;
}

// Order is locked by `nav-items.test.ts`; reordering is intentional and
// requires updating the test snapshot.
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Dashboard", iconName: "LayoutDashboard" },
  { href: "/projects", label: "Projects", iconName: "Folder" },
  { href: "/docs", label: "Docs", iconName: "FileText" },
  { href: "/boards", label: "Board", iconName: "Kanban" },
  { href: "/agents", label: "Agents", iconName: "Bot" },
  { href: "/runs", label: "Runs", iconName: "Activity" },
  { href: "/orchestration", label: "Orchestration", iconName: "Workflow" },
  { href: "/search", label: "Search", iconName: "Search" },
  { href: "/settings/orchestration", label: "Settings", iconName: "Settings" },
] as const;
