import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { sampleDataEnabled } from "@/sample";
import "@/components/engage/engage.css";
import "@/components/compliance/compliance.css";

// Phân hệ Tuân thủ: cả hai màn chờ module `compliance` của bước 37 của core, dựng bằng dữ liệu mẫu
// (W-006, W-012). Tắt dữ liệu mẫu thì phân hệ không tồn tại.
export default function ComplianceLayout({ children }: { children: ReactNode }) {
  if (!sampleDataEnabled()) notFound();
  return <ToastProvider>{children}</ToastProvider>;
}
