import { bn } from "@hishabai/shared";
import { ComingNext } from "@/components/shell/coming-next";

export const metadata = { title: bn.nav.customers };

export default function CustomersPage() {
  return (
    <ComingNext
      title={bn.nav.customers}
      summary="কাস্টমারের প্রোফাইল, লেনদেনের ইতিহাস আর ছাপার উপযোগী বকেয়া বিবরণী।"
      includes={[
        "প্রতিটি কাস্টমারের প্রোফাইল — মোট বিক্রয়, মোট পেমেন্ট, বর্তমান বকেয়া",
        "লেনদেন, পেমেন্ট ও ক্রয়ের সম্পূর্ণ ইতিহাস",
        "বকেয়া বিবরণী — প্রিন্ট ও PDF",
      ]}
    />
  );
}
