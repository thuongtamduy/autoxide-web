import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Forbidden, PageHead } from "@/components/engage/common";
import { Icon } from "@/components/shell/icon";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { FORMS_EXPORT, FORMS_MANAGE, FORMS_READ } from "@/lib/engage";
import { can } from "@/lib/viewer";

// Màn "Biểu mẫu" (module `forms`): danh sách form và tra dữ liệu theo email. Mỗi tab một đường
// dẫn con; tab chỉ hiện khi người xem có permission của nó (core vẫn kiểm ở mỗi lời gọi).
export default async function FormsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("engage.forms");
  const [read, manage, exporter] = await Promise.all([
    can(FORMS_READ),
    can(FORMS_MANAGE),
    can(FORMS_EXPORT),
  ]);
  if (!read && !exporter) return <Forbidden permission={`${FORMS_READ}, ${FORMS_EXPORT}`} />;
  const tabs: PageTab[] = [
    ...(read ? [{ href: "/marketing/forms", label: t("tabs.forms") }] : []),
    ...(exporter ? [{ href: "/marketing/forms/data", label: t("tabs.data") }] : []),
  ];
  return (
    <div className="page">
      <PageHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("description")}
        actions={
          manage ? (
            <Link className="btn pri" href="/marketing/forms/new">
              <Icon name="plus" />
              {t("create")}
            </Link>
          ) : null
        }
      />
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
