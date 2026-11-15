import {
  eraseNewsletterData,
  lookupNewsletterData,
} from "@/app/(admin)/marketing/newsletter/actions";
import { Forbidden } from "@/components/engage/common";
import { DataByEmail } from "@/components/engage/data-by-email";
import { NEWSLETTER_EXPORT } from "@/lib/engage";
import { can } from "@/lib/viewer";

// Tab "Dữ liệu theo email" của Bản tin: người đăng ký, đăng ký kèm bằng chứng đồng ý, thư đã gửi
// và chặn của một địa chỉ; tải về hoặc xoá theo yêu cầu của chủ dữ liệu. Cần `newsletter.export`.
export default async function NewsletterDataPage() {
  if (!(await can(NEWSLETTER_EXPORT))) return <Forbidden permission={NEWSLETTER_EXPORT} />;
  return (
    <DataByEmail
      kind="newsletter"
      lookup={lookupNewsletterData}
      erase={eraseNewsletterData}
      canErase
    />
  );
}
