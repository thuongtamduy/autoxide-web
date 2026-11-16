import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Forbidden, PageHead } from "@/components/engage/common";
import { Icon } from "@/components/shell/icon";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { NEWSLETTER_EXPORT, NEWSLETTER_MANAGE, NEWSLETTER_READ } from "@/lib/engage";
import { can } from "@/lib/viewer";

// Màn "Bản tin" (module `newsletter`): chiến dịch, danh sách nhận tin, người đăng ký, danh sách
// không gửi, dữ liệu theo email. Mỗi tab một đường dẫn con; tab chỉ hiện khi có permission.
export default async function NewsletterLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("engage.newsletter");
  const [read, manage, exporter] = await Promise.all([
    can(NEWSLETTER_READ),
    can(NEWSLETTER_MANAGE),
    can(NEWSLETTER_EXPORT),
  ]);
  if (!read && !exporter) {
    return <Forbidden permission={`${NEWSLETTER_READ}, ${NEWSLETTER_EXPORT}`} />;
  }
  const base = "/marketing/newsletter";
  const tabs: PageTab[] = [
    ...(read
      ? [
          { href: base, label: t("tabs.campaigns") },
          { href: `${base}/lists`, label: t("tabs.lists"), nested: true },
          { href: `${base}/subscribers`, label: t("tabs.subscribers"), nested: true },
          { href: `${base}/suppressions`, label: t("tabs.suppressions") },
        ]
      : []),
    ...(exporter ? [{ href: `${base}/data`, label: t("tabs.data") }] : []),
  ];
  return (
    <div className="page">
      <PageHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("description")}
        actions={
          manage ? (
            <Link className="btn pri" href={`${base}/campaigns/new`}>
              <Icon name="plus" />
              {t("compose")}
            </Link>
          ) : null
        }
      />
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
