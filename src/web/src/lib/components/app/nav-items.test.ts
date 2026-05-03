import { describe, expect, test } from "bun:test";

import { LUCIDE_ICONS, NAV_ITEMS, type NavItem } from "./nav-items.ts";

describe("NAV_ITEMS surface", () => {
  test("declares exactly 7 items", () => {
    expect(NAV_ITEMS).toHaveLength(7);
  });

  test("exposes hrefs in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/",
      "/projects",
      "/docs",
      "/boards",
      "/agents",
      "/runs",
      "/search",
      "/settings/inference",
    ]);
  });

  test("exposes labels in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Dashboard",
      "Projects",
      "Docs",
      "Board",
      "Agents",
      "Runs",
      "Search",
      "Inference",
    ]);
  });

  test("each entry uses an icon resolvable through LUCIDE_ICONS", () => {
    for (const item of NAV_ITEMS) {
      expect(LUCIDE_ICONS).toHaveProperty(item.iconName);
      expect(typeof LUCIDE_ICONS[item.iconName]).toBe("function");
    }
  });

  test("locks the icon assignment per entry", () => {
    const pairs: Array<[string, NavItem["iconName"]]> = [
      ["/", "LayoutDashboard"],
      ["/projects", "Folder"],
      ["/docs", "FileText"],
      ["/boards", "Kanban"],
      ["/agents", "Bot"],
      ["/runs", "Activity"],
      ["/search", "Search"],
      ["/settings/inference", "Settings"],
    ];
    for (const [href, iconName] of pairs) {
      const entry = NAV_ITEMS.find((i) => i.href === href);
      expect(entry?.iconName).toBe(iconName);
    }
  });
});
