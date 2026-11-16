import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Icon } from "@/components/shell/icon";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { abilities } from "@/lib/content";
import { CONTENT_MANAGE } from "@/lib/permissions";
import { can, getMe } from "@/lib/viewer";

// Màn "Trang và cấu trúc" (module `content`): mỗi tab một đường dẫn con. Mọi tab gọi core thật
// (bước 17); tab Menu chỉ đọc menu cũ của `content` (sắp ngừng, thay bằng module `menus`).
// Chuyển hướng cần `content.manage` để xem, nên tab chỉ hiện với người có quyền đó.
export default async function StructureLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("structure");
  const [me, manage] = await Promise.all([getMe(), can(CONTENT_MANAGE)]);
  const tabs: PageTab[] = [
    { href: "/content/structure", label: t("tabs.pages") },
    { href: "/content/structure/terms", label: t("tabs.terms") },
    { href: "/content/structure/authors", label: t("tabs.authors") },
    { href: "/content/structure/menus", label: t("tabs.menus") },
    ...(manage ? [{ href: "/content/structure/redirects", label: t("tabs.redirects") }] : []),
    { href: "/content/structure/history", label: t("tabs.history") },
  ];
  return (
    <div className="page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb">{t("crumb")}</span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description")}</p>
        </div>
        {abilities(me).write ? (
          <div className="headacts">
            <Link className="btn pri" href="/content/new?kind=page">
              <Icon name="plus" />
              {t("newPage")}
            </Link>
          </div>
        ) : null}
      </section>
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
