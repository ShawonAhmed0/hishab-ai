import { loadEntryFormData } from "@hishabai/core";
import { bn } from "@hishabai/shared";
import { sessionWithData } from "@/lib/session";
import { EntryForm } from "./entry-form";

export const metadata = { title: bn.nav.newEntry };

export default async function EntryPage() {
  // One transaction, one connection, one consistent snapshot, fetched while
  // the session resolves in parallel. The dropdowns are local after this — a
  // data-entry operator should never wait on the network between keystrokes.
  const { data } = await sessionWithData(loadEntryFormData);

  return (
    <EntryForm
      parties={data.parties}
      products={data.products}
      units={data.units}
      wallets={data.wallets}
      incomeCategories={data.incomeCategories}
      expenseCategories={data.expenseCategories}
      postingAccounts={data.postingAccounts}
      recipes={data.recipes}
      productCategories={data.productCategories}
    />
  );
}
