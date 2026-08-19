import { History, ShieldCheck, UserCog, Users } from "lucide-react";
import { can, getUsers } from "@hishabai/core";
import { ROLES, type Dictionary, type Role, type StringKeys } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { CountTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";
import { AddMemberForm, RemoveMemberButton, RoleSelect } from "./users-forms";

export async function generateMetadata() {
  return { title: (await dict()).nav.users };
}

/** Keys, resolved per request — see the note on NAV_ITEMS. */
const ROLE_SUMMARY: Record<Role, StringKeys<Dictionary["users"]>> = {
  admin: "roleSummaryAdmin",
  manager: "roleSummaryManager",
  operator: "roleSummaryOperator",
};

export default async function UsersPage() {
  const [{ session, data }, t] = await Promise.all([sessionWithData(getUsers), dict()]);
  const editable = can(session, "user.manage");

  const active = data.members.filter((member) => member.isActive);
  const admins = active.filter((member) => member.role === "admin");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.nav.users}</h1>
          <p className="text-sm text-muted-foreground">{t.users.hint}</p>
        </div>
        {editable ? <AddMemberForm /> : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CountTile
          label={t.users.activeUsers}
          value={active.length}
          suffix={t.users.people}
          icon={Users}
        />
        <CountTile
          label={t.role.admin}
          value={admins.length}
          suffix={t.users.people}
          icon={ShieldCheck}
        />
        <CountTile
          label={t.users.recentActivity}
          value={data.activity.length}
          suffix={t.users.countSuffix}
          icon={History}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.nav.users}</CardTitle>
          {!editable ? (
            <span className="text-xs text-muted-foreground">{t.users.needsAdmin}</span>
          ) : null}
        </CardHeader>

        <div className="hidden md:block">
          <TableScroll>
            <THead>
              <TR>
                <TH>{t.fields.name}</TH>
                <TH>{t.fields.phone}</TH>
                <TH>{t.users.roleColumn}</TH>
                <TH numeric>{t.users.entriesColumn}</TH>
                <TH>{t.users.joinedColumn}</TH>
                {editable ? <TH /> : null}
              </TR>
            </THead>
            <tbody>
              {data.members.map((member) => {
                const isSelf = member.userId === session.userId;
                return (
                  <TR key={member.userId} className={member.isActive ? "" : "opacity-60"}>
                    <TD>
                      <span className="font-medium">{member.fullName}</span>
                      {isSelf ? (
                        <Badge tone="neutral" className="ml-2">
                          {t.users.you}
                        </Badge>
                      ) : null}
                      {!member.isActive ? (
                        <Badge tone="neutral" className="ml-2">
                          {t.users.removed}
                        </Badge>
                      ) : null}
                      {member.invitedByName ? (
                        <p className="text-xs text-muted-foreground">
                          {t.users.invitedBy(member.invitedByName)}
                        </p>
                      ) : null}
                    </TD>
                    <TD className="num text-muted-foreground">{member.phone ?? "—"}</TD>
                    <TD>
                      {editable && member.isActive ? (
                        <RoleSelect
                          userId={member.userId}
                          role={member.role}
                          disabled={isSelf}
                        />
                      ) : (
                        <span className="text-sm">{t.role[member.role]}</span>
                      )}
                    </TD>
                    <TD numeric className="num text-muted-foreground">
                      {member.entryCount}
                      {member.lastEntryAt ? (
                        <p className="text-xs">
                          {formatDateShort(member.lastEntryAt.slice(0, 10))}
                        </p>
                      ) : null}
                    </TD>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {formatDateShort(member.joinedAt.slice(0, 10))}
                    </TD>
                    {editable ? (
                      <TD className="text-right">
                        {member.isActive ? (
                          <RemoveMemberButton
                            userId={member.userId}
                            name={member.fullName}
                            disabled={isSelf}
                          />
                        ) : null}
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </tbody>
          </TableScroll>
        </div>

        <MobileCards>
          {data.members.map((member) => (
            <MobileRow
              key={member.userId}
              title={member.fullName}
              subtitle={member.phone ?? t.masterData.noPhone}
              right={
                <>
                  <Badge tone="neutral">{t.role[member.role]}</Badge>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.users.entryCount(String(member.entryCount))}
                  </p>
                </>
              }
            />
          ))}
        </MobileCards>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <UserCog className="size-4 text-primary" aria-hidden />
                {t.users.whatRolesCanDo}
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {ROLES.map((role) => (
              <div key={role} className="flex gap-3">
                <Badge tone="neutral" className="mt-0.5 shrink-0">
                  {t.role[role]}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {t.users[ROLE_SUMMARY[role]]}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <History className="size-4 text-primary" aria-hidden />
                {t.users.recentActivity}
              </span>
            </CardTitle>
            <span className="text-xs text-muted-foreground">{t.users.lastThirty}</span>
          </CardHeader>

          {data.activity.length === 0 ? (
            <EmptyState title={t.users.noActivity} />
          ) : (
            <ol className="divide-y divide-border">
              {data.activity.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {entry.summaryBn ?? `${entry.entityType} ${entry.action}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.actorName ?? t.users.system}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateShort(entry.createdAt.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
