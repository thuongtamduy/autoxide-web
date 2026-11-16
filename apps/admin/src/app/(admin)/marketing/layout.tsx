import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import "@/components/engage/engage.css";

// Phân hệ Tiếp thị: biểu mẫu, bản tin, bình luận (module `forms`, `newsletter`, `comments`).
// Thông báo nổi sau thao tác (kèm Hoàn tác khi đảo được) dùng chung cho cả ba màn.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
