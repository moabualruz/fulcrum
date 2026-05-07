import type { Component } from "svelte";

import Activity from "@lucide/svelte/icons/activity";
import FileText from "@lucide/svelte/icons/file-text";
import Folder from "@lucide/svelte/icons/folder";
import Kanban from "@lucide/svelte/icons/kanban";
import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
import Search from "@lucide/svelte/icons/search";
import Settings from "@lucide/svelte/icons/settings";

export { NAV_GROUPS, NAV_ITEMS, type LucideIconName, type NavGroup, type NavItem } from "./nav-data.ts";

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
