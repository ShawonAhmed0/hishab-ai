import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  LayoutDashboard,
  PlusCircle,
  Settings,
  Truck,
  Users,
  UserCog,
} from "lucide-react";
import type { Route } from "next";
import type { Dictionary } from "@hishabai/shared";
import type { Permission } from "@hishabai/core";

/**
 * The three groups, in the order a shop meets them.
 *
 * Grouped by how often the screen is opened, not by what the code calls it:
 * `everyday` is what gets touched between customers, `records` is what gets
 * looked up when a question comes in, `admin` is set up once and left alone.
 * A label that does not encode something true is decoration, and the sidebar
 * was legible without one before this.
 */
export const NAV_GROUPS = ["everyday", "records", "admin"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  href: Route;
  group: NavGroup;
  /**
   * A key, not a string.
   *
   * This list is module state, evaluated once when the module loads, so a
   * resolved label would freeze whichever locale happened to be current for
   * the first request the server handled.
   */
  label: keyof Dictionary["nav"];
  icon: typeof LayoutDashboard;
  /** Hidden entirely when the role lacks this. */
  permission?: Permission;
  /** Shown in the bottom bar on phones — five at most. */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", group: "everyday", label: "dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/entry", group: "everyday", label: "newEntry", icon: PlusCircle, mobile: true },
  { href: "/transactions", group: "everyday", label: "transactions", icon: ArrowLeftRight, mobile: true },
  { href: "/inventory", group: "records", label: "inventory", icon: Boxes, permission: "product.manage" },
  { href: "/customers", group: "records", label: "customers", icon: Users, permission: "party.manage", mobile: true },
  { href: "/vendors", group: "records", label: "vendors", icon: Truck, permission: "party.manage" },
  { href: "/reports", group: "records", label: "reports", icon: BarChart3, permission: "report.viewFinancial", mobile: true },
  { href: "/users", group: "admin", label: "users", icon: UserCog, permission: "user.manage" },
  { href: "/settings", group: "admin", label: "settings", icon: Settings, permission: "settings.manage" },
];
