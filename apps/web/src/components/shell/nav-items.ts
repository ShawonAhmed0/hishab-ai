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
import { bn } from "@hishabai/shared";
import type { Permission } from "@hishabai/core";

export interface NavItem {
  href: Route;
  label: string;
  icon: typeof LayoutDashboard;
  /** Hidden entirely when the role lacks this. */
  permission?: Permission;
  /** Shown in the bottom bar on phones — five at most. */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: bn.nav.dashboard, icon: LayoutDashboard, mobile: true },
  { href: "/entry", label: bn.nav.newEntry, icon: PlusCircle, mobile: true },
  { href: "/transactions", label: bn.nav.transactions, icon: ArrowLeftRight, mobile: true },
  { href: "/inventory", label: bn.nav.inventory, icon: Boxes, permission: "product.manage" },
  { href: "/customers", label: bn.nav.customers, icon: Users, permission: "party.manage", mobile: true },
  { href: "/vendors", label: bn.nav.vendors, icon: Truck, permission: "party.manage" },
  { href: "/reports", label: bn.nav.reports, icon: BarChart3, permission: "report.viewFinancial", mobile: true },
  { href: "/users", label: bn.nav.users, icon: UserCog, permission: "user.manage" },
  { href: "/settings", label: bn.nav.settings, icon: Settings, permission: "settings.manage" },
];
