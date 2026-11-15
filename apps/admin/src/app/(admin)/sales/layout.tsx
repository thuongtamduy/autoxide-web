import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import "@/components/engage/engage.css";

// Phân hệ Bán hàng: Vận chuyển (dữ liệu mẫu, bước 44); Đơn hàng, Cửa hàng, Kênh bán dựng sau. Thông
// báo nổi sau thao tác (kèm Hoàn tác khi đảo được) dùng chung cho các màn của phân hệ.
export default function SalesLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
