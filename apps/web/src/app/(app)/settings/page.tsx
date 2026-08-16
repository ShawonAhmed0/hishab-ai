import { Building2, Layers, Ruler, Tags, Wallet, Wrench } from "lucide-react";
import { getSettings } from "@hishabai/core";
import { bn, formatPercent, formatQty, moneyFromDb, qtyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { requireSession, sessionWithData } from "@/lib/session";
import { can } from "@hishabai/core";
import {
  AddRecipePanel,
  CategoryForm,
  CompanyForm,
  DeactivateButton,
  DeactivateRecipeButton,
  ProductCategoryForm,
  UnitForm,
  WalletForm,
} from "./settings-forms";

export const metadata = { title: bn.nav.settings };

export default async function SettingsPage() {
  const { session, data } = await sessionWithData(getSettings);

  // The nav already hides this page without the permission, but a typed URL
  // reaches it anyway — so the forms are gated here rather than only there.
  const editable = can(session, "settings.manage");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{bn.nav.settings}</h1>
        <p className="text-sm text-muted-foreground">
          কোম্পানির তথ্য, পেমেন্ট মাধ্যম, একক ও খাত
        </p>
      </div>

      {!editable ? (
        <Card>
          <CardBody className="text-sm text-muted-foreground">
            সেটিংস দেখতে পারছেন, কিন্তু পরিবর্তন করতে অ্যাডমিন অনুমতি লাগবে।
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Building2 className="size-4 text-primary" aria-hidden />
              কোম্পানির তথ্য
            </span>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {editable ? (
            <CompanyForm company={data.company} />
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="নাম" value={data.company.nameBn ?? data.company.name} />
              <Detail label="ব্যবসার ধরন" value={data.company.businessType} />
              <Detail label={bn.fields.phone} value={data.company.phone} />
              <Detail label={bn.fields.address} value={data.company.address} />
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Wallet className="size-4 text-primary" aria-hidden />
              {bn.fields.paymentMethod}
            </span>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            ব্যালেন্স খাতা থেকে আসে, হাতে বদলানো যায় না
          </span>
        </CardHeader>

        <TableScroll narrow>
          <THead>
            <TR>
              <TH>নাম</TH>
              <TH>ধরন</TH>
              <TH numeric>প্রারম্ভিক</TH>
              <TH numeric>বর্তমান ব্যালেন্স</TH>
              {editable ? <TH /> : null}
            </TR>
          </THead>
          <tbody>
            {data.wallets.map((wallet) => (
              <TR key={wallet.id} className={wallet.isActive ? "" : "opacity-60"}>
                <TD>
                  <span className="font-medium">{wallet.nameBn}</span>
                  {wallet.isDefault ? (
                    <Badge tone="neutral" className="ml-2">
                      ডিফল্ট
                    </Badge>
                  ) : null}
                  {!wallet.isActive ? (
                    <Badge tone="neutral" className="ml-2">
                      বন্ধ
                    </Badge>
                  ) : null}
                  {wallet.bankName || wallet.accountNumber ? (
                    <p className="text-xs text-muted-foreground">
                      {wallet.bankName}
                      {wallet.accountNumber ? ` · ${wallet.accountNumber}` : ""}
                    </p>
                  ) : null}
                </TD>
                <TD className="text-muted-foreground">
                  {bn.financialAccountKind[wallet.kind]}
                  {wallet.mfsProvider ? ` · ${bn.mfsProvider[wallet.mfsProvider]}` : ""}
                </TD>
                <TD numeric>
                  <MoneyText
                    value={moneyFromDb(wallet.openingBalance)}
                    size="sm"
                    symbol={false}
                  />
                </TD>
                <TD numeric className="font-medium">
                  <MoneyText value={moneyFromDb(wallet.balance)} size="sm" tone="auto" />
                </TD>
                {editable ? (
                  <TD className="text-right">
                    {wallet.isActive ? (
                      <DeactivateButton
                        target="wallet"
                        id={wallet.id}
                        name={wallet.nameBn}
                        disabled={wallet.isDefault}
                        {...(wallet.isDefault ? { disabledReason: "ডিফল্ট মাধ্যম" } : {})}
                      />
                    ) : null}
                  </TD>
                ) : null}
              </TR>
            ))}
          </tbody>
        </TableScroll>

        {editable ? (
          <CardBody>
            <WalletForm />
          </CardBody>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Tags className="size-4 text-primary" aria-hidden />
                আয়-ব্যয়ের খাত
              </span>
            </CardTitle>
          </CardHeader>

          <TableScroll narrow>
            <THead>
              <TR>
                <TH>খাত</TH>
                <TH>ধরন</TH>
                {editable ? <TH /> : null}
              </TR>
            </THead>
            <tbody>
              {data.categories.map((category) => (
                <TR key={category.id}>
                  <TD>
                    <span className="num mr-2 text-xs text-subtle-foreground">
                      {category.code}
                    </span>
                    {category.nameBn}
                  </TD>
                  <TD>
                    <Badge tone={category.type === "income" ? "credit" : "debit"}>
                      {bn.transactionType[category.type]}
                    </Badge>
                  </TD>
                  {editable ? (
                    <TD className="text-right">
                      <DeactivateButton
                        target="category"
                        id={category.id}
                        name={category.nameBn}
                        disabled={category.isSystem}
                        {...(category.isSystem ? { disabledReason: "সিস্টেম খাত" } : {})}
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </TableScroll>

          {editable ? (
            <CardBody>
              <CategoryForm />
            </CardBody>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Ruler className="size-4 text-primary" aria-hidden />
                  একক
                </span>
              </CardTitle>
            </CardHeader>

            <TableScroll narrow>
              <THead>
                <TR>
                  <TH>নাম</TH>
                  <TH>সংক্ষিপ্ত</TH>
                  <TH numeric>পণ্য</TH>
                  {editable ? <TH /> : null}
                </TR>
              </THead>
              <tbody>
                {data.units.map((unit) => (
                  <TR key={unit.id}>
                    <TD>{unit.nameBn}</TD>
                    <TD className="num text-muted-foreground">{unit.symbol}</TD>
                    <TD numeric className="num text-muted-foreground">
                      {unit.productCount}
                    </TD>
                    {editable ? (
                      <TD className="text-right">
                        <DeactivateButton
                          target="unit"
                          id={unit.id}
                          name={unit.nameBn}
                          disabled={unit.productCount > 0}
                          {...(unit.productCount > 0
                            ? { disabledReason: `${unit.productCount} টি পণ্যে ব্যবহৃত` }
                            : {})}
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </tbody>
            </TableScroll>

            {editable ? (
              <CardBody>
                <UnitForm />
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Layers className="size-4 text-primary" aria-hidden />
                  পণ্যের ক্যাটাগরি
                </span>
              </CardTitle>
            </CardHeader>

            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {data.productCategories.map((category) => (
                  <span
                    key={category.id}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
                  >
                    {category.nameBn}
                    <span className="num text-xs text-subtle-foreground">
                      {category.productCount}
                    </span>
                    {editable && category.productCount === 0 ? (
                      <DeactivateButton
                        target="productCategory"
                        id={category.id}
                        name={category.nameBn}
                      />
                    ) : null}
                  </span>
                ))}
              </div>

              {editable ? <ProductCategoryForm /> : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Wrench className="size-4 text-primary" aria-hidden />
              {bn.fields.recipe}
            </span>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            উৎপাদন এন্ট্রিতে কাঁচামাল নিজে থেকেই বসাতে
          </span>
        </CardHeader>

        <CardBody className="space-y-3">
          {data.recipes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              কোনো রেসিপি নেই। রেসিপি ছাড়াও উৎপাদন এন্ট্রি করা যায় — এটি শুধু টাইপ করা কমায়।
            </p>
          ) : (
            <ul className="space-y-3">
              {data.recipes.map((recipe) => (
                <li
                  key={recipe.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {recipe.nameBn ?? recipe.outputProductNameBn}
                      {recipe.expectedYieldPercent ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {bn.fields.yield}{" "}
                          {formatPercent(moneyFromDb(recipe.expectedYieldPercent))}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {recipe.inputs
                        .map(
                          (line) =>
                            `${line.productNameBn} ${formatQty(qtyFromDb(line.quantityPerUnit), {
                              unit: line.unitSymbol,
                            })}`,
                        )
                        .join(" + ")}
                      {" → "}
                      {recipe.outputProductNameBn}
                    </p>
                  </div>
                  {editable ? (
                    <DeactivateRecipeButton
                      id={recipe.id}
                      name={recipe.nameBn ?? recipe.outputProductNameBn}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {editable ? <AddRecipePanel products={data.products} /> : null}
        </CardBody>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}
