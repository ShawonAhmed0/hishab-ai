import { bn } from "@hishabai/shared";
import { ComingNext } from "@/components/shell/coming-next";

export const metadata = { title: bn.nav.vendors };

export default function VendorsPage() {
  return (
    <ComingNext
      title={bn.nav.vendors}
      summary="ভেন্ডরের প্রোফাইল, পাওনার হিসাব আর ভেন্ডর বিবরণী।"
      includes={[
        "প্রতিটি ভেন্ডরের মোট ক্রয়, মোট পেমেন্ট ও বর্তমান পাওনা",
        "ক্রয় ও পেমেন্টের ইতিহাস",
        "ভেন্ডর বিবরণী — প্রিন্ট ও PDF",
      ]}
    />
  );
}
