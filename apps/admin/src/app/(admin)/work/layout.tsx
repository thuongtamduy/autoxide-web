import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PageHead } from "@/components/engage/common";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import { sampleDataEnabled } from "@/sample";
import { waiting, workRows } from "@/work/server";
import "@/components/engage/engage.css";
import "@/components/work/work.css";

// Màn "Việc và hoạt động" (W-020): mỗi tab một đường dẫn con. Việc cần làm và Hoạt động đọc từ các
// phân hệ và nhật ký audit (thật khi core có API); Đã ghim, Xem trước thao tác, Tuỳ chọn thông báo là
// dữ liệu mẫu (chờ API của bước 51, 37 / 52), chỉ hiện khi bật dữ liệu mẫu. Mọi người đã đăng nhập đều
// mở được: mỗi người thấy việc theo permission của mình.
export default async function WorkLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("work");
  const { rows } = await workRows();
  const sample = sampleDataEnabled();
  const open = waiting(rows).length;
  const tabs: PageTab[] = [
    { href: "/work", label: t("tabs.work"), ...(open > 0 ? { badge: String(open) } : {}) },
    { href: "/work/activity", label: t("tabs.activity") },
    ...(sample
      ? [
          { href: "/work/pins", label: t("tabs.pins") },
          { href: "/work/dry-run", label: t("tabs.dryRun") },
          { href: "/work/notifications", label: t("tabs.notifications") },
        ]
      : []),
  ];
  return (
    <ToastProvider>
      <div className="page">
        <PageHead crumb={t("crumb")} title={t("title")} description={t("description")} />
        <PageTabs tabs={tabs} label={t("tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
