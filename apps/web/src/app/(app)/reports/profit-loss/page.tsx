import { getProfitLoss, type ProfitLossLine } from "@hishabai/core";
import { bn, type Money } from "@hishabai/shared";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { StatTile } from "@/components/ui/stat-tile";
import { TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { ReportFrame, periodFrom } from "@/components/reports/report-frame";
import { sessionWithData } from "@/lib/session";

export const metadata = { title: "লাভ-ক্ষতি" };

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const period = periodFrom(await searchParams);
  const { data } = await sessionWithData((scope) => getProfitLoss(scope, period));
  const { totals } = data;

  return (
    <ReportFrame
      title="লাভ-ক্ষতি"
      description="নির্বাচিত সময়ে কত আয় হলো, কত খরচ হলো, আর হাতে কত থাকল"
      period={period}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="বিক্রয়" value={totals.sales} tone="credit" />
        <StatTile
          label="বিক্রীত পণ্যের ব্যয়"
          value={totals.cogs}
          tone="debit"
          footnote="গড় ক্রয়মূল্যে হিসাব করা"
        />
        <StatTile
          label="মোট মুনাফা"
          value={totals.grossProfit}
          tone="auto"
          footnote="বিক্রয় − পণ্যের ব্যয়"
        />
        <StatTile
          label={bn.dashboard.netProfit}
          value={totals.netProfit}
          tone="auto"
          footnote="সব খরচ বাদ দেওয়ার পর"
        />
      </div>

      {data.income.length === 0 && data.expense.length === 0 ? (
        <Card>
          <EmptyState
            title="এই সময়ে কোনো আয় বা ব্যয় নেই"
            hint="অন্য তারিখ বেছে দেখুন, অথবা প্রথম এন্ট্রিটি করুন"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section
            title="আয়"
            lines={data.income}
            total={totals.income}
            tone="credit"
            empty="এই সময়ে কোনো আয় হয়নি"
          />
          <Section
            title="ব্যয়"
            lines={data.expense}
            total={totals.expense}
            tone="debit"
            empty="এই সময়ে কোনো ব্যয় হয়নি"
          />
        </div>
      )}

      {/* The one line the whole report exists to produce. */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
          <div>
            <p className="font-semibold">{bn.dashboard.netProfit}</p>
            <p className="text-xs text-muted-foreground">মোট আয় − মোট ব্যয়</p>
          </div>
          <MoneyText value={totals.netProfit} size="xl" tone="auto" />
        </div>
      </Card>
    </ReportFrame>
  );
}

function Section({
  title,
  lines,
  total,
  tone,
  empty,
}: {
  title: string;
  lines: ProfitLossLine[];
  total: Money;
  tone: "credit" | "debit";
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <MoneyText value={total} size="sm" tone={tone} className="font-semibold" />
      </CardHeader>

      {lines.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <TableScroll narrow>
          <THead>
            <TR>
              <TH>খাত</TH>
              <TH numeric>পরিমাণ</TH>
            </TR>
          </THead>
          <tbody>
            {lines.map((line) => (
              <TR key={line.accountId}>
                <TD>{line.name}</TD>
                <TD numeric>
                  <MoneyText value={line.amount} size="sm" symbol={false} tone={tone} />
                </TD>
              </TR>
            ))}
          </tbody>
          <tfoot>
            <TR className="border-t-2 border-border-strong bg-surface-sunken">
              <TD className="font-semibold">মোট {title}</TD>
              <TD numeric>
                <MoneyText value={total} size="sm" symbol={false} tone={tone} className="font-bold" />
              </TD>
            </TR>
          </tfoot>
        </TableScroll>
      )}
    </Card>
  );
}
