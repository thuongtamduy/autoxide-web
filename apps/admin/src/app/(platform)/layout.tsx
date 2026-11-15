import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/shell/admin-shell";
import { ToastProvider } from "@/components/ui/toast";
import { getCurrentTenant } from "@/lib/viewer";
import "@/components/engage/engage.css";
import "@/components/platform/platform.css";

// Mặt điều khiển nền tảng (W-014, W-027): không gian riêng của nhân sự vận hành Autoxide, khung chung
// với sổ `NAV_PLATFORM`. Khách hàng và đội database dùng API thật của bước 33; các màn còn lại chờ API
// của bước 34, 35, 39 và chỉ có khi bật dữ liệu mẫu (W-006). Chỉ nhân sự của khách nền tảng vào được
// (`platform` của `GET /kernel/tenant`; core cũ không trả thì để từng màn tự kiểm). Mỗi màn tự kiểm
// permission.
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const current = await getCurrentTenant();
  if (current && !current.platform) notFound();
  return (
    <AdminShell workspace="platform">
      <ToastProvider>{children}</ToastProvider>
    </AdminShell>
  );
}
