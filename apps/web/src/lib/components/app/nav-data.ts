export const LUCIDE_ICON_NAMES = [
	"Activity",
	"FileText",
	"Folder",
	"Kanban",
	"LayoutDashboard",
	"Search",
	"Settings",
] as const;

export type LucideIconName = (typeof LUCIDE_ICON_NAMES)[number];

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
		items: [{ href: "/settings/inference", label: "Settings", iconName: "Settings" }],
	},
] as const;

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
