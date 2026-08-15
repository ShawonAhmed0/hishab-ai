import { bn } from "@hishabai/shared";
import { ComingNext } from "@/components/shell/coming-next";

export const metadata = { title: bn.nav.users };

export default function UsersPage() {
  return (
    <ComingNext
      title={bn.nav.users}
      summary="ব্যবহারকারী ও অনুমতি ব্যবস্থাপনা। ভূমিকাভিত্তিক নিয়ন্ত্রণ এখনই কাজ করছে — শুধু ব্যবস্থাপনার পর্দাটি বাকি।"
      includes={[
        "ব্যবহারকারী আমন্ত্রণ ও ভূমিকা নির্ধারণ (অ্যাডমিন, ম্যানেজার, অপারেটর)",
        "প্রতি ব্যবহারকারীর জন্য আলাদা অনুমতি",
        "অডিট লগ — কে কী করেছে, কখন",
      ]}
    />
  );
}
