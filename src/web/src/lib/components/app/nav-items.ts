import type { Component } from "svelte";

import Activity from "@lucide/svelte/icons/activity";
import FileText from "@lucide/svelte/icons/file-text";
import Folder from "@lucide/svelte/icons/folder";
import Kanban from "@lucide/svelte/icons/kanban";
import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
import Search from "@lucide/svelte/icons/search";
import Settings from "@lucide/svelte/icons/settings";

// Co-located lookup so tests can snapshot the icon surface without dragging
// every Svelte component into the suite. Keys MUST match `NavItem.iconName`.
export const LUCIDE_ICONS = {
  Activity,
  FileText,
  Folder,
  Kanban,
  LayoutDashboard,
  Search,
  Settings,
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

export interface NavGroup {
  label: "Work" | "Agent OS" | "System" | "Settings";
  items: readonly NavItem[];
}

// Group order is locked by `nav-items.test.ts`; reordering is intentional and
// requires updating the test snapshot.
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Dashboard", iconName: "LayoutDashboard" },
      { href: "/projects", label: "Projects", iconName: "Folder" },
      { href: "/boards", label: "Board", iconName: "Kanban" },
      { href: "/docs", label: "Docs", iconName: "FileText" },
    ],
  },
  {
    label: "Agent OS",
    items: [
      { href: "/agents", label: "Agents", iconName: "Activity" },
      { href: "/runs", label: "Runs", iconName: "Activity" },
      { href: "/artifacts", label: "Artifacts", iconName: "FileText" },
      { href: "/orchestration", label: "Orchestration", iconName: "Kanban" },
      { href: "/memory", label: "Memory", iconName: "FileText" },
      { href: "/context/preview", label: "Context", iconName: "FileText" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/search", label: "Search", iconName: "Search" },
      { href: "/audit", label: "Audit", iconName: "FileText" },
      { href: "/doctor", label: "Doctor", iconName: "Activity" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings/inference", label: "Settings", iconName: "Settings" },
    ],
  },
] as const;

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
