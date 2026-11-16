import type { ReactNode } from "react";
import { AdminShell } from "@/components/shell/admin-shell";

// Khung của không gian khách (W-004): thanh bên theo phân hệ của khách. Khung chung nằm ở
// `AdminShell`; mặt điều khiển nền tảng dùng cùng khung với sổ riêng (layout `(platform)`, W-014).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell workspace="tenant">{children}</AdminShell>;
}
