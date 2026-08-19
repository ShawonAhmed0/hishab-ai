import { getProfitLoss, type ProfitLossLine } from "@hishabai/core";
import type { Dictionary, Money } from "@hishabai/shared";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { StatTile } from "@/components/ui/stat-tile";
import { TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { ReportFrame, periodFrom } from "@/components/reports/report-frame";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";

export async function generateMetadata() {
  return { title: (await dict()).reports.profitLoss };
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const period = periodFrom(await searchParams);
  const [{ data }, t] = await Promise.all([
    sessionWithData((scope) => getProfitLoss(scope, period)),
    dict(),
  ]);
  const { totals } = data;

  return (
    <ReportFrame
      title={t.reports.profitLoss}
      description={t.reports.profitLossDescription}
      period={period}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t.transactionType.sale} value={totals.sales} tone="credit" />
        <StatTile
          label={t.accountSubtype.cogs}
          value={totals.cogs}
          tone="debit"
          footnote={t.reports.atAverageCost}
        />
        <StatTile
          label={t.reports.grossProfit}
          value={totals.grossProfit}
          tone="auto"
          footnote={t.reports.grossProfitFormula}
        />
        <StatTile
          label={t.dashboard.netProfit}
          value={totals.netProfit}
          tone="auto"
          footnote={t.reports.netProfitFootnote}
        />
      </div>

      {data.income.length === 0 && data.expense.length === 0 ? (
        <Card>
          <EmptyState
            title={t.reports.noIncomeOrExpense}
            hint={t.reports.noIncomeOrExpenseHint}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section
            t={t}
            title={t.transactionType.income}
            lines={data.income}
            total={totals.income}
            tone="credit"
            empty={t.reports.noIncome}
          />
          <Section
            t={t}
            title={t.transactionType.expense}
            lines={data.expense}
            total={totals.expense}
            tone="debit"
            empty={t.reports.noExpense}
          />
        </div>
      )}

      {/* The one line the whole report exists to produce. */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
          <div>
            <p className="font-semibold">{t.dashboard.netProfit}</p>
            <p className="text-xs text-muted-foreground">{t.reports.netProfitFormula}</p>
          </div>
          <MoneyText value={totals.netProfit} size="xl" tone="auto" />
        </div>
      </Card>
    </ReportFrame>
  );
}

function Section({
  t,
  title,
  lines,
  total,
  tone,
  empty,
}: {
  t: Dictionary;
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
              <TH>{t.reports.accountColumn}</TH>
              <TH numeric>{t.reports.amountColumn}</TH>
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
              <TD className="font-semibold">{t.reports.sectionTotal(title)}</TD>
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
