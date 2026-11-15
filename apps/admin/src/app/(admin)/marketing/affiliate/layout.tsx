import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { RuleDialog, ScheduleDialog } from "@/components/affiliate/forms";
import { SampleBadge } from "@/components/sample-badge";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { AFFILIATE_LIVE_MANAGE, AFFILIATE_MANAGE } from "@/lib/affiliate";
import { can } from "@/lib/viewer";
import {
  categoryOptions,
  hostOptions,
  listPartners,
  listPayouts,
  listSessions,
  PLATFORMS,
} from "@/sample/affiliate";
import { AFFILIATE_TABS, ENDPOINTS_49, productOptions } from "./shared";
import "@/components/catalog/catalog.css";
import "@/components/orders/orders.css";

// Màn "Tiếp thị liên kết" (bản thiết kế Affiliate): bán qua người tiếp thị (KOL, KOC) và livestream đúng
// luật — người tiếp thị, người phát phải xác thực danh tính trước khi hoạt động (Luật TMĐT 2025); hoa hồng
// theo quy tắc có ngày hiệu lực; chi trả có khấu trừ thuế TNCN. Cả màn dựng bằng dữ liệu mẫu (W-006, W-019)
// vì core chưa có module `affiliate` (bước 49). Mỗi tab một đường dẫn con, theo permission của tab.
export default async function AffiliateLayout({ children }: { children: ReactNode }) {
  const gate = await commerceGate(Object.values(AFFILIATE_TABS).flat());
  if (gate) return gate;
  const [t, show, manage, live, partners, payouts, sessions, hosts, cats, products] =
    await Promise.all([
      getTranslations("affiliate"),
      Promise.all(Object.values(AFFILIATE_TABS).map((p) => can(p))),
      can(AFFILIATE_MANAGE),
      can(AFFILIATE_LIVE_MANAGE),
      listPartners(),
      listPayouts(),
      listSessions(),
      hostOptions(),
      categoryOptions(),
      productOptions(),
    ]);
  const [partnersTab, rules, commissions, payoutsTab, liveTab, portal] = show;
  const partnerOptions = partners.data
    .filter((p) => p.status !== "terminated")
    .map((p) => ({ value: p.id, label: p.name }));
  const tabs: PageTab[] = [
    ...(partnersTab
      ? [
          {
            href: "/marketing/affiliate",
            label: t("tabs.partners"),
            badge: String(partners.data.filter((p) => p.status === "pending_review").length),
          },
        ]
      : []),
    ...(rules ? [{ href: "/marketing/affiliate/rules", label: t("tabs.rules") }] : []),
    ...(commissions
      ? [{ href: "/marketing/affiliate/commissions", label: t("tabs.commissions") }]
      : []),
    ...(payoutsTab
      ? [
          {
            href: "/marketing/affiliate/payouts",
            label: t("tabs.payouts"),
            badge: String(
              payouts.data.filter((p) => p.status === "building" || p.status === "failed").length,
            ),
          },
        ]
      : []),
    ...(liveTab
      ? [
          {
            href: "/marketing/affiliate/live",
            label: t("tabs.live"),
            badge: String(sessions.data.filter((s) => s.status === "live").length),
          },
        ]
      : []),
    ...(portal ? [{ href: "/marketing/affiliate/portal", label: t("tabs.portal") }] : []),
  ];
  return (
    <div className="page cat-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb ell">{t("crumb")}</span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description")}</p>
          <span className="cat-sample">
            <SampleBadge step="49" endpoint={ENDPOINTS_49} />
          </span>
        </div>
        {manage || live ? (
          <div className="headacts">
            {live ? (
              <ScheduleDialog
                hosts={hosts}
                platforms={PLATFORMS.map((p) => ({ value: p, label: t(`platforms.${p}`) }))}
              />
            ) : null}
            {manage ? (
              <RuleDialog categories={cats} products={products} partners={partnerOptions} />
            ) : null}
          </div>
        ) : null}
      </section>
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
