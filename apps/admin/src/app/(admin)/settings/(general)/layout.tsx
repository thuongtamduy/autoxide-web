import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { MessagePanel } from "@/components/message-panel";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import { AUDIT_READ, MODULES_READ, WEBHOOKS_MANAGE } from "@/lib/permissions";
import { generalTabs } from "./tabs";

// Màn "Cài đặt chung": mỗi tab một đường dẫn con. Module, webhook, nhật ký audit gọi core thật;
// gói và thuê bao, tên miền, kết nối đối tác, job chờ API (bước 33, 35, 52): dựng bằng dữ liệu
// mẫu (W-006), chỉ hiện khi bật dữ liệu mẫu, có nhãn "mẫu". Tab Nhân sự là link sang màn Tổ chức.
export default async function GeneralSettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const visible = await generalTabs();
  if (visible.filter((tab) => !tab.external).length === 0) {
    return (
      <MessagePanel
        title={t("errors.forbiddenTitle")}
        message={t("errors.forbidden", {
          permission: `${MODULES_READ}, ${WEBHOOKS_MANAGE}, ${AUDIT_READ}`,
        })}
      />
    );
  }
  const tabs: PageTab[] = visible.map((tab) => ({
    href: tab.href,
    label: t(`settings.tabs.${tab.id}`),
    ...(tab.external ? {} : { nested: true }),
    ...(tab.sample ? { badge: t("sample.tab") } : {}),
  }));
  return (
    <ToastProvider>
      <div className="page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{t("settings.crumb")}</span>
            <h1 className="h1">{t("settings.general.title")}</h1>
            <p className="pdesc">{t("settings.general.description")}</p>
          </div>
        </section>
        <PageTabs tabs={tabs} label={t("settings.tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
