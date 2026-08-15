/**
 * Who is asking, and what they are allowed to ask for.
 *
 * Every service function in this package takes a Session as its first
 * argument. The web layer builds it from the Supabase JWT plus the
 * company_members row; nothing below this line trusts anything the browser
 * sent about identity or role.
 */
import type { Role } from "@hishabai/shared";

export interface Session {
  userId: string;
  companyId: string;
  role: Role;
  /** For the audit trail, when the caller can supply them. */
  ipAddress?: string;
  userAgent?: string;
}

export type Permission =
  | "transaction.create"
  | "transaction.cancel"
  | "transaction.viewAll"
  | "party.manage"
  | "product.manage"
  | "report.viewFinancial"
  | "company.manage"
  | "user.manage"
  | "settings.manage";

/**
 * Spec §2. An operator can enter what they see and look at what they entered;
 * they cannot reach the financial settings or the profit reports.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [
    "transaction.create",
    "transaction.cancel",
    "transaction.viewAll",
    "party.manage",
    "product.manage",
    "report.viewFinancial",
    "company.manage",
    "user.manage",
    "settings.manage",
  ],
  manager: [
    "transaction.create",
    "transaction.cancel",
    "transaction.viewAll",
    "party.manage",
    "product.manage",
    "report.viewFinancial",
  ],
  operator: ["transaction.create"],
};

export function can(session: Session, permission: Permission): boolean {
  return ROLE_PERMISSIONS[session.role].includes(permission);
}

export class PermissionError extends Error {
  readonly messageBn = "এই কাজটি করার অনুমতি আপনার নেই।";
  readonly permission: Permission;

  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionError";
    this.permission = permission;
  }
}

export function requirePermission(session: Session, permission: Permission): void {
  if (!can(session, permission)) throw new PermissionError(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
