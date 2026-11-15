import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import "@/components/engage/engage.css";

// Phân hệ Bán hàng: Đơn hàng, Cửa hàng (bước 45), Vận chuyển (bước 44), dữ liệu mẫu; Kênh bán dựng sau. Thông
// báo nổi sau thao tác (kèm Hoàn tác khi đảo được) dùng chung cho các màn của phân hệ.
export default function SalesLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
