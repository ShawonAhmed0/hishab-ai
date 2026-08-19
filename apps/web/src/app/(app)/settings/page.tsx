import { Building2, KeyRound, Layers, Ruler, Tags, Wallet, Wrench } from "lucide-react";
import { getSettings, overridePinIsSet } from "@hishabai/core";
import { formatPercent, formatQty, moneyFromDb, qtyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { requireSession, sessionWithData } from "@/lib/session";
import { can } from "@hishabai/core";
import {
  AddRecipePanel,
  CategoryForm,
  CompanyForm,
  DeactivateButton,
  DeactivateRecipeButton,
  OverridePinForm,
  ProductCategoryForm,
  UnitForm,
  WalletForm,
} from "./settings-forms";

export async function generateMetadata() {
  return { title: (await dict()).nav.settings };
}

export default async function SettingsPage() {
  const [{ session, data }, t] = await Promise.all([sessionWithData(getSettings), dict()]);

  // A boolean, and only for the caller: the hash is never read by a page.
  const pinIsSet = session.role === "admin" ? await overridePinIsSet(session) : false;

  // The nav already hides this page without the permission, but a typed URL
  // reaches it anyway — so the forms are gated here rather than only there.
  const editable = can(session, "settings.manage");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.nav.settings}</h1>
        <p className="text-sm text-muted-foreground">{t.settings.hint}</p>
      </div>

      {!editable ? (
        <Card>
          <CardBody className="text-sm text-muted-foreground">
            {t.settings.readOnlyNotice}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Building2 className="size-4 text-primary" aria-hidden />
              {t.settings.companyProfile}
            </span>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {editable ? (
            <CompanyForm company={data.company} />
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail
                label={t.fields.name}
                value={data.company.nameBn ?? data.company.name}
              />
              <Detail label={t.settings.businessType} value={data.company.businessType} />
              <Detail label={t.fields.phone} value={data.company.phone} />
              <Detail label={t.fields.address} value={data.company.address} />
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Wallet className="size-4 text-primary" aria-hidden />
              {t.fields.paymentMethod}
            </span>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {t.settings.walletsBalanceNote}
          </span>
        </CardHeader>

        <TableScroll narrow>
          <THead>
            <TR>
              <TH>{t.settings.nameColumn}</TH>
              <TH>{t.settings.kindColumn}</TH>
              <TH numeric>{t.settings.openingColumn}</TH>
              <TH numeric>{t.settings.currentBalanceColumn}</TH>
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
                      {t.settings.isDefault}
                    </Badge>
                  ) : null}
                  {!wallet.isActive ? (
                    <Badge tone="neutral" className="ml-2">
                      {t.settings.disabled}
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
                  {t.financialAccountKind[wallet.kind]}
                  {wallet.mfsProvider ? ` · ${t.mfsProvider[wallet.mfsProvider]}` : ""}
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
                        {...(wallet.isDefault ? { disabledReason: t.settings.defaultMethod } : {})}
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
                {t.settings.categories}
              </span>
            </CardTitle>
          </CardHeader>

          <TableScroll narrow>
            <THead>
              <TR>
                <TH>{t.settings.categoryColumn}</TH>
                <TH>{t.settings.kindColumn}</TH>
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
                      {t.transactionType[category.type]}
                    </Badge>
                  </TD>
                  {editable ? (
                    <TD className="text-right">
                      <DeactivateButton
                        target="category"
                        id={category.id}
                        name={category.nameBn}
                        disabled={category.isSystem}
                        {...(category.isSystem ? { disabledReason: t.settings.systemCategory } : {})}
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
                  {t.fields.unit}
                </span>
              </CardTitle>
            </CardHeader>

            <TableScroll narrow>
              <THead>
                <TR>
                  <TH>{t.settings.nameColumn}</TH>
                  <TH>{t.settings.abbreviationColumn}</TH>
                  <TH numeric>{t.settings.productsColumn}</TH>
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
                            ? {
                                disabledReason: t.settings.usedInProducts(
                                  String(unit.productCount),
                                ),
                              }
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
                  {t.settings.productCategories}
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
              {t.fields.recipe}
            </span>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {t.settings.recipesHint}
          </span>
        </CardHeader>

        <CardBody className="space-y-3">
          {data.recipes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.settings.noRecipes}
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
                          {t.fields.yield}{" "}
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

      {/*
        Admins only, and only their own PIN — spec R1.2. A manager can reach
        this page but has nothing to set here, because a manager cannot
        override in the first place.
      */}
      {session.role === "admin" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <KeyRound className="size-4 text-primary" aria-hidden />
                {t.override.setTitle}
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <OverridePinForm isSet={pinIsSet} />
          </CardBody>
        </Card>
      ) : null}
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
