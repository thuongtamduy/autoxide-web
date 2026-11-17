import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CreateUserDialog } from "@/components/access/create-user";
import { MessagePanel } from "@/components/message-panel";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import {
  DELEGATIONS_READ,
  INVITATIONS_MANAGE,
  ROLES_READ,
  SUPPORT_ACCESS_READ,
  UNITS_READ,
  USERS_MANAGE,
  USERS_READ,
} from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";

// Màn "Người dùng và role" của phân hệ Tổ chức. Mỗi tab một đường dẫn con; tab chỉ hiện khi
// người xem có permission đọc của nó. Người dùng, role và hồ sơ công khai gọi core thật. Lời mời,
// uỷ quyền, quyền vào hỗ trợ còn dựng bằng dữ liệu mẫu (W-006), chỉ hiện khi bật dữ liệu mẫu, có
// nhãn "mẫu" (core đã có API ở bước 34: nối ở đợt sau).
export default async function AccessLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const [users, roles, manage, units] = await Promise.all([
    can(USERS_READ),
    can(ROLES_READ),
    can(USERS_MANAGE),
    can(UNITS_READ),
  ]);
  if (!users && !roles) {
    return (
      <MessagePanel
        title={t("errors.forbiddenTitle")}
        message={t("errors.forbidden", { permission: `${USERS_READ}, ${ROLES_READ}` })}
      />
    );
  }
  const sample = sampleDataEnabled();
  const sampleTabs: [string, string, string][] = [
    ["invitations", "/org/access/invitations", INVITATIONS_MANAGE],
    ["delegations", "/org/access/delegations", DELEGATIONS_READ],
    ["support", "/org/access/support", SUPPORT_ACCESS_READ],
  ];
  const allowed = sample ? await Promise.all(sampleTabs.map(([, , p]) => can(p))) : [];
  const tabs: PageTab[] = [
    ...(users ? [{ href: "/org/access/users", label: t("access.tabs.users"), nested: true }] : []),
    ...(roles ? [{ href: "/org/access/roles", label: t("access.tabs.roles"), nested: true }] : []),
    ...(units ? [{ href: "/org/access/public", label: t("access.tabs.public") }] : []),
    ...sampleTabs
      .filter((_, index) => allowed[index])
      .map(([id, href]) => ({ href, label: t(`access.tabs.${id}`), badge: t("sample.tab") })),
  ];
  return (
    <ToastProvider>
      <div className="page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{t("access.crumb")}</span>
            <h1 className="h1">{t("access.title")}</h1>
            <p className="pdesc">{t("access.description")}</p>
          </div>
          {users && manage ? (
            <div className="headacts">
              <CreateUserDialog />
            </div>
          ) : null}
        </section>
        <PageTabs tabs={tabs} label={t("access.tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
