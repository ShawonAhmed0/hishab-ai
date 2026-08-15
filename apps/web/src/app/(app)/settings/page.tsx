import { bn } from "@hishabai/shared";
import { ComingNext } from "@/components/shell/coming-next";

export const metadata = { title: bn.nav.settings };

export default function SettingsPage() {
  return (
    <ComingNext
      title={bn.nav.settings}
      summary="কোম্পানির তথ্য, পেমেন্ট মাধ্যম, খাত ও ব্যবসার নিয়ম।"
      includes={[
        "কোম্পানির তথ্য ও লোগো",
        "ব্যাংক ও মোবাইল ব্যাংকিং অ্যাকাউন্ট যোগ করা",
        "আয়-ব্যয়ের খাত ও একক কনফিগার করা",
        "উৎপাদনের নিয়ম প্রতি পণ্যে",
      ]}
    />
  );
}
