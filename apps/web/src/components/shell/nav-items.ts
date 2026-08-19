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

export interface NavItem {
  href: Route;
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
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/entry", label: "newEntry", icon: PlusCircle, mobile: true },
  { href: "/transactions", label: "transactions", icon: ArrowLeftRight, mobile: true },
  { href: "/inventory", label: "inventory", icon: Boxes, permission: "product.manage" },
  { href: "/customers", label: "customers", icon: Users, permission: "party.manage", mobile: true },
  { href: "/vendors", label: "vendors", icon: Truck, permission: "party.manage" },
  { href: "/reports", label: "reports", icon: BarChart3, permission: "report.viewFinancial", mobile: true },
  { href: "/users", label: "users", icon: UserCog, permission: "user.manage" },
  { href: "/settings", label: "settings", icon: Settings, permission: "settings.manage" },
];
