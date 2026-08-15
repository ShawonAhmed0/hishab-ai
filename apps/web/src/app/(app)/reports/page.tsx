import { bn } from "@hishabai/shared";
import { ComingNext } from "@/components/shell/coming-next";

export const metadata = { title: bn.nav.reports };

export default function ReportsPage() {
  return (
    <ComingNext
      title={bn.nav.reports}
      summary="সম্পূর্ণ রিপোর্ট সেট — তারিখ ফিল্টার, সার্চ, এক্সপোর্ট ও প্রিন্টসহ।"
      includes={[
        "আয়, ব্যয়, লাভ-ক্ষতি, ক্যাশ, ব্যাংক ও MFS রিপোর্ট",
        "বিক্রয় ও ক্রয় — কাস্টমার, ভেন্ডর, পণ্য ও তারিখ অনুযায়ী",
        "স্টক রিপোর্ট, মুভমেন্ট, ভ্যালুয়েশন, উৎপাদন ও অপচয়",
        "বকেয়া ও পাওনা রিপোর্ট, বয়সভিত্তিক বিশ্লেষণ",
      ]}
    />
  );
}
