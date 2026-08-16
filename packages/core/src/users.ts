/**
 * ব্যবহারকারী — who else can get into this company's books, and what they did.
 *
 * Roles are read from `company_members` on every request rather than carried in
 * a token, so a change here takes effect on the person's next click. The
 * database enforces the same rule the service does: the policy on
 * `company_members` only accepts writes from an admin of that company, so a bug
 * in this file cannot hand somebody a role.
 */
import { and, eq, sql } from "drizzle-orm";
import { companyMembers, tenantQuery, tenantRead, withTenant } from "@hishabai/db";
import { ROLES, type Role } from "@hishabai/shared";
import { permissionsFor, requirePermission, type Session, type TenantScope } from "./session";

export interface MemberRow {
  userId: string;
  fullName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  joinedAt: string;
  invitedByName: string | null;
  /** Vouchers this person has posted — the difference between a seat and a user. */
  entryCount: number;
  lastEntryAt: string | null;
}

export interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  summaryBn: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface UsersView {
  members: MemberRow[];
  activity: ActivityRow[];
}

export async function getUsers(scope: TenantScope): Promise<UsersView> {
  const rows = await tenantRead<{
    members: MemberRow[] | null;
    activity: ActivityRow[] | null;
    [key: string]: unknown;
  }>(
    scope,
    tenantQuery`
      select
        (select coalesce(json_agg(t order by t."joinedAt"), '[]'::json) from (
          select cm.user_id as "userId", p.full_name as "fullName", p.phone,
                 cm.role::text as role, cm.is_active as "isActive",
                 cm.created_at::text as "joinedAt",
                 inviter.full_name as "invitedByName",
                 coalesce(posted.count, 0)::int as "entryCount",
                 posted.last_at::text as "lastEntryAt"
            from company_members cm
            join profiles p on p.id = cm.user_id
            left join profiles inviter on inviter.id = cm.invited_by
            left join (
              select created_by, count(*) as count, max(created_at) as last_at
                from transactions
               where company_id = app.current_company_id()
               group by created_by
            ) posted on posted.created_by = cm.user_id
           where cm.company_id = app.current_company_id()
        ) t) as members,

        (select coalesce(json_agg(t order by t."createdAt" desc), '[]'::json) from (
          select a.id, a.action::text as action, a.entity_type as "entityType",
                 a.summary_bn as "summaryBn", p.full_name as "actorName",
                 a.created_at::text as "createdAt"
            from audit_logs a
            left join profiles p on p.id = a.user_id
           where a.company_id = app.current_company_id()
           order by a.created_at desc
           limit 30
        ) t) as activity
    `,
  );

  return {
    members: rows[0]?.members ?? [],
    activity: rows[0]?.activity ?? [],
  };
}

/** What each role can reach, for the table that explains the choice. */
export function roleCapabilities(role: Role): readonly string[] {
  return permissionsFor(role);
}

function checkRole(value: unknown): Role {
  if (typeof value !== "string" || !ROLES.includes(value as Role)) {
    throw new Error("ভূমিকা সঠিক নয়");
  }
  return value as Role;
}

/**
 * Adds someone who already has an account, by phone number.
 *
 * The lookup runs inside `app.add_member_by_phone` because RLS — correctly —
 * hides the profile of anybody you do not already share a company with. There
 * is no email invitation: sending mail needs infrastructure this app does not
 * have yet, and a half-built invite that silently never arrives is worse than
 * asking the person to register first.
 */
export async function addMember(
  session: Session,
  phone: string,
  rawRole: unknown,
): Promise<string> {
  requirePermission(session, "user.manage");
  const role = checkRole(rawRole);

  const digits = phone.replace(/[^0-9+]/g, "");
  if (digits.length < 6) throw new Error("মোবাইল নম্বর সঠিক নয়");

  return withTenant(session, async (tx) => {
    const rows = (await tx.execute(sql`
      select app.add_member_by_phone(
        ${session.companyId}::uuid, ${digits}, ${role}::role
      ) as user_id
    `)) as unknown as { user_id: string }[];

    return rows[0]!.user_id;
  });
}

export async function changeMemberRole(
  session: Session,
  userId: string,
  rawRole: unknown,
): Promise<void> {
  requirePermission(session, "user.manage");
  const role = checkRole(rawRole);

  // Demoting yourself is how an admin locks the company out of its own
  // settings — there may be nobody left who can undo it.
  if (userId === session.userId) {
    throw new Error("নিজের ভূমিকা নিজে বদলানো যাবে না");
  }

  await withTenant(session, async (tx) => {
    await assertNotLastAdmin(tx, session, userId, role === "admin");

    await tx
      .update(companyMembers)
      .set({ role, updatedAt: new Date() })
      .where(
        and(
          eq(companyMembers.companyId, session.companyId),
          eq(companyMembers.userId, userId),
        ),
      );
  });
}

/**
 * Removing somebody deactivates the membership.
 *
 * Their name is on every voucher they posted, and `transactions.created_by`
 * points at the profile — deleting the row would leave the ledger unable to say
 * who entered what.
 */
export async function removeMember(session: Session, userId: string): Promise<void> {
  requirePermission(session, "user.manage");

  if (userId === session.userId) {
    throw new Error("নিজেকে সরানো যাবে না");
  }

  await withTenant(session, async (tx) => {
    await assertNotLastAdmin(tx, session, userId, false);

    await tx
      .update(companyMembers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(companyMembers.companyId, session.companyId),
          eq(companyMembers.userId, userId),
        ),
      );
  });
}

/**
 * A company with no admin cannot add one back — the policy on
 * `company_members` only accepts writes from an admin, so the last one leaving
 * closes the door behind them.
 */
async function assertNotLastAdmin(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  session: Session,
  userId: string,
  willStayAdmin: boolean,
): Promise<void> {
  if (willStayAdmin) return;

  const rows = (await tx.execute(sql`
    select count(*)::int as count
      from company_members
     where company_id = ${session.companyId}::uuid
       and role = 'admin' and is_active
       and user_id <> ${userId}::uuid
  `)) as unknown as { count: number }[];

  if ((rows[0]?.count ?? 0) === 0) {
    throw new Error("শেষ অ্যাডমিনকে সরানো বা ভূমিকা বদলানো যাবে না");
  }
}
