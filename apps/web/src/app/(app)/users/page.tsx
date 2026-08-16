import { History, ShieldCheck, UserCog, Users } from "lucide-react";
import { can, getUsers } from "@hishabai/core";
import { ROLES, bn } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { CountTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { sessionWithData } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";
import { AddMemberForm, RemoveMemberButton, RoleSelect } from "./users-forms";

export const metadata = { title: bn.nav.users };

/** Spec §2, in the words the person choosing has to weigh. */
const ROLE_SUMMARY: Record<string, string> = {
  admin: "সবকিছু — সেটিংস, ব্যবহারকারী ও লাভের রিপোর্টসহ",
  manager: "এন্ট্রি, বাতিল, কাস্টমার, পণ্য ও রিপোর্ট — সেটিংস ছাড়া",
  operator: "শুধু এন্ট্রি করতে পারেন, লাভ-ক্ষতি দেখতে পারেন না",
};

export default async function UsersPage() {
  const { session, data } = await sessionWithData(getUsers);
  const editable = can(session, "user.manage");

  const active = data.members.filter((member) => member.isActive);
  const admins = active.filter((member) => member.role === "admin");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{bn.nav.users}</h1>
          <p className="text-sm text-muted-foreground">
            কে কী করতে পারবে, আর কে কী করেছে
          </p>
        </div>
        {editable ? <AddMemberForm /> : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CountTile label="সক্রিয় ব্যবহারকারী" value={active.length} suffix="জন" icon={Users} />
        <CountTile label="অ্যাডমিন" value={admins.length} suffix="জন" icon={ShieldCheck} />
        <CountTile
          label="সাম্প্রতিক কার্যক্রম"
          value={data.activity.length}
          suffix="টি"
          icon={History}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ব্যবহারকারী</CardTitle>
          {!editable ? (
            <span className="text-xs text-muted-foreground">
              পরিবর্তন করতে অ্যাডমিন অনুমতি লাগবে
            </span>
          ) : null}
        </CardHeader>

        <div className="hidden md:block">
          <TableScroll>
            <THead>
              <TR>
                <TH>{bn.fields.name}</TH>
                <TH>{bn.fields.phone}</TH>
                <TH>ভূমিকা</TH>
                <TH numeric>এন্ট্রি</TH>
                <TH>যোগ হয়েছেন</TH>
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
                          আপনি
                        </Badge>
                      ) : null}
                      {!member.isActive ? (
                        <Badge tone="neutral" className="ml-2">
                          সরানো হয়েছে
                        </Badge>
                      ) : null}
                      {member.invitedByName ? (
                        <p className="text-xs text-muted-foreground">
                          যোগ করেছেন {member.invitedByName}
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
                        <span className="text-sm">{bn.role[member.role]}</span>
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
              subtitle={member.phone ?? "মোবাইল নম্বর নেই"}
              right={
                <>
                  <Badge tone="neutral">{bn.role[member.role]}</Badge>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {member.entryCount} টি এন্ট্রি
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
                ভূমিকা কী কী করতে পারে
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {ROLES.map((role) => (
              <div key={role} className="flex gap-3">
                <Badge tone="neutral" className="mt-0.5 shrink-0">
                  {bn.role[role]}
                </Badge>
                <p className="text-sm text-muted-foreground">{ROLE_SUMMARY[role]}</p>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <History className="size-4 text-primary" aria-hidden />
                সাম্প্রতিক কার্যক্রম
              </span>
            </CardTitle>
            <span className="text-xs text-muted-foreground">শেষ ৩০টি</span>
          </CardHeader>

          {data.activity.length === 0 ? (
            <EmptyState title="এখনো কোনো কার্যক্রম নেই" />
          ) : (
            <ol className="divide-y divide-border">
              {data.activity.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {entry.summaryBn ?? `${entry.entityType} ${entry.action}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.actorName ?? "সিস্টেম"}
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
