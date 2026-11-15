import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Forbidden, PageHead } from "@/components/engage/common";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { COMMENTS_EXPORT, COMMENTS_MANAGE, COMMENTS_READ } from "@/lib/engage";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";

// Màn "Bình luận" (module `comments`): hàng chờ duyệt, theo bài, danh sách cấm, cài đặt, dữ liệu
// theo email. Mỗi tab một đường dẫn con; tab chỉ hiện khi có permission.
export default async function CommentsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("engage.comments");
  const [read, manage, exporter] = await Promise.all([
    can(COMMENTS_READ),
    can(COMMENTS_MANAGE),
    can(COMMENTS_EXPORT),
  ]);
  if (!read && !manage && !exporter) {
    return <Forbidden permission={`${COMMENTS_READ}, ${COMMENTS_MANAGE}, ${COMMENTS_EXPORT}`} />;
  }
  const base = "/marketing/comments";
  const tabs: PageTab[] = [
    ...(read ? [{ href: base, label: t("tabs.queue") }] : []),
    ...(read ? [{ href: `${base}/targets`, label: t("tabs.targets"), nested: true }] : []),
    ...(manage ? [{ href: `${base}/bans`, label: t("tabs.bans") }] : []),
    {
      href: `${base}/settings`,
      label: t("tabs.settings"),
      ...(sampleDataEnabled() && manage ? { badge: (await getTranslations("sample"))("tab") } : {}),
    },
    ...(exporter ? [{ href: `${base}/data`, label: t("tabs.data") }] : []),
  ];
  return (
    <div className="page">
      <PageHead crumb={t("crumb")} title={t("title")} description={t("description")} />
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
