import { bn } from "@hishabai/shared";
import { ComingNext } from "@/components/shell/coming-next";

export const metadata = { title: bn.actions.search };

export default function SearchPage() {
  return (
    <ComingNext
      title="গ্লোবাল সার্চ"
      summary="এক জায়গা থেকে কাস্টমার, ভেন্ডর, পণ্য, মেমো, ভাউচার ও অঙ্ক খোঁজা। ডেটাবেসের সার্চ ইনডেক্স তৈরি আছে; পর্দাটি বাকি।"
      includes={[
        "কাস্টমার, ভেন্ডর ও পণ্যের নাম",
        "মেমো ও ভাউচার নম্বর",
        "অঙ্ক ও তারিখ অনুযায়ী লেনদেন",
      ]}
    />
  );
}
