import { bn } from "@hishabai/shared";
import { ComingNext } from "@/components/shell/coming-next";

export const metadata = { title: bn.nav.inventory };

export default function InventoryPage() {
  return (
    <ComingNext
      title={bn.nav.inventory}
      summary="পণ্য ব্যবস্থাপনা, স্টক মুভমেন্ট আর উৎপাদনের পর্দা। হিসাবের ইঞ্জিন এখনই স্টক ঠিক রাখছে — শুধু দেখার পর্দাটি বাকি।"
      includes={[
        "পণ্য যোগ ও সম্পাদনা, একক ও ক্যাটাগরি",
        "স্টক ইন/আউট, সমন্বয় ও গড় মূল্যের ইতিহাস",
        "উৎপাদন — কাঁচামাল থেকে পণ্য, অপচয়সহ",
        "সর্বনিম্ন স্টকের সতর্কতা (ড্যাশবোর্ডে এখনই দেখা যাচ্ছে)",
      ]}
    />
  );
}
