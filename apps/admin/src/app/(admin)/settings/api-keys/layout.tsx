import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import { API_KEYS_MANAGE } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";

// Màn "API key và AI agent": máy và AI agent dùng Autoxide qua REST và MCP với đúng permission
// được cấp. API key gọi core thật: key của chính người đăng nhập, và key của mọi người cho người có
// `auth.api_keys.manage`. Lệnh chờ duyệt và nhật ký gọi tool MCP chờ API của bước 51: dựng bằng dữ
// liệu mẫu (W-006), chỉ hiện khi bật dữ liệu mẫu.
export default async function ApiKeysLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const sample = sampleDataEnabled();
  const manage = await can(API_KEYS_MANAGE);
  const tabs: PageTab[] = [
    ...(sample
      ? [
          {
            href: "/settings/api-keys/approvals",
            label: t("settings.agent.tabs.approvals"),
            badge: t("sample.tab"),
          },
        ]
      : []),
    { href: "/settings/api-keys", label: t("settings.agent.tabs.keys") },
    ...(manage ? [{ href: "/settings/api-keys/all", label: t("settings.agent.tabs.all") }] : []),
    { href: "/settings/api-keys/mcp", label: t("settings.agent.tabs.mcp") },
    ...(sample
      ? [
          {
            href: "/settings/api-keys/tool-calls",
            label: t("settings.agent.tabs.calls"),
            badge: t("sample.tab"),
          },
        ]
      : []),
  ];
  return (
    <ToastProvider>
      <div className="page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{t("settings.agent.crumb")}</span>
            <h1 className="h1">{t("settings.agent.title")}</h1>
            <p className="pdesc">{t("settings.agent.description")}</p>
          </div>
          <div className="headacts">
            <Link className="btn pri" href="/settings/api-keys/new">
              {t("settings.apiKeys.new")}
            </Link>
          </div>
        </section>
        <PageTabs tabs={tabs} label={t("settings.agent.tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
