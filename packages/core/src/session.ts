/**
 * Who is asking, and what they are allowed to ask for.
 *
 * Every service function in this package takes a Session as its first
 * argument. The web layer builds it from the Supabase JWT plus the
 * company_members row; nothing below this line trusts anything the browser
 * sent about identity or role.
 */
import type { Role } from "@hishabai/shared";

/**
 * Identity and company, without a role that has been checked against the
 * database yet.
 *
 * This exists so a page can start its own read while the membership lookup is
 * still in flight, instead of waiting a full round trip to learn something the
 * database is going to verify anyway: the `tenant_isolation` policy requires
 * `app.is_member(company_id)`, so a company id taken from a cookie can only
 * ever return zero rows if it is not really theirs.
 *
 * It is deliberately *not* a Session. Reads may take a scope; anything that
 * writes or checks a permission needs the resolved role.
 */
export interface TenantScope {
  userId: string;
  companyId: string;
}

export interface Session extends TenantScope {
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
