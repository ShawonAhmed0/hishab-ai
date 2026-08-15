import { loadEntryFormData } from "@hishabai/core";
import { bn } from "@hishabai/shared";
import { requireSession } from "@/lib/session";
import { EntryForm } from "./entry-form";

export const metadata = { title: bn.nav.newEntry };

export default async function EntryPage() {
  const session = await requireSession();

  // One transaction, one connection, one consistent snapshot. The dropdowns
  // are local after this — a data-entry operator should never wait on the
  // network between two keystrokes.
  const data = await loadEntryFormData(session);

  return (
    <EntryForm
      parties={data.parties}
      products={data.products}
      units={data.units}
      wallets={data.wallets}
      incomeCategories={data.incomeCategories}
      expenseCategories={data.expenseCategories}
    />
  );
}
