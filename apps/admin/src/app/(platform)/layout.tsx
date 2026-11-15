import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/shell/admin-shell";
import { ToastProvider } from "@/components/ui/toast";
import { sampleDataEnabled } from "@/sample";
import "@/components/engage/engage.css";
import "@/components/platform/platform.css";

// Mặt điều khiển nền tảng (W-014): không gian riêng của nhân sự vận hành Autoxide, khung chung với
// sổ `NAV_PLATFORM`. Cả không gian chờ API của bước 33, 34, 35, 39 của core và dựng bằng dữ liệu
// mẫu (W-006): tắt dữ liệu mẫu thì không gian này không tồn tại. Mỗi màn tự kiểm permission.
export default function PlatformLayout({ children }: { children: ReactNode }) {
  if (!sampleDataEnabled()) notFound();
  return (
    <AdminShell workspace="platform">
      <ToastProvider>{children}</ToastProvider>
    </AdminShell>
  );
}
