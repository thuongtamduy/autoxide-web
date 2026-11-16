import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { MessagePanel } from "@/components/message-panel";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import { coreUrl } from "@/lib/env";
import { DEVTOOLS_READ, WEBHOOKS_MANAGE } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";

/** Core có bật trang xem tài liệu API (`AUTOXIDE_HTTP_API_DOCS=true`, ở `/api/docs`) không. */
async function docsPage(): Promise<string | null> {
  const url = `${coreUrl()}/api/docs`;
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    await response.body?.cancel();
    return response.ok ? url : null;
  } catch {
    return null;
  }
}

// Màn "Nhà phát triển": lần giao webhook của mọi endpoint (core thật), nhật ký request và event
// theo bản ghi (dữ liệu mẫu, chờ bàn kỹ thuật của bước 52). Đầu trang có tài liệu OpenAPI của core.
export default async function DevelopersLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const [webhooks, devtools, docs] = await Promise.all([
    can(WEBHOOKS_MANAGE),
    can(DEVTOOLS_READ),
    docsPage(),
  ]);
  const sample = sampleDataEnabled() && devtools;
  if (!webhooks && !sample) {
    return (
      <MessagePanel
        title={t("errors.forbiddenTitle")}
        message={t("errors.forbidden", { permission: `${WEBHOOKS_MANAGE}, ${DEVTOOLS_READ}` })}
      />
    );
  }
  const d = (key: string) => t(`settings.developers.${key}`);
  const tabs: PageTab[] = [
    ...(sample
      ? [
          {
            href: "/settings/developers/requests",
            label: d("tabs.requests"),
            badge: t("sample.tab"),
          },
        ]
      : []),
    ...(webhooks ? [{ href: "/settings/developers", label: d("tabs.webhooks") }] : []),
    ...(sample
      ? [{ href: "/settings/developers/events", label: d("tabs.events"), badge: t("sample.tab") }]
      : []),
  ];
  return (
    <ToastProvider>
      <div className="page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{d("crumb")}</span>
            <h1 className="h1">{d("title")}</h1>
            <p className="pdesc">{d("description")}</p>
          </div>
          <div className="headacts">
            {/* Route của ứng dụng tải `openapi.json` từ core rồi trả về như file. */}
            <a className="btn" href="/settings/developers/openapi.json" download>
              {d("openapi")}
            </a>
            {docs ? (
              <a className="btn pri" href={docs} target="_blank" rel="noreferrer">
                {d("docs")}
              </a>
            ) : null}
          </div>
        </section>
        {docs ? null : <p className="fhint">{d("docsOff")}</p>}
        <PageTabs tabs={tabs} label={d("tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
