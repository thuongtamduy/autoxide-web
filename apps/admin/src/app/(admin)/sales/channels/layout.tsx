import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { ConnectDialog, SyncNowButton } from "@/components/channels/forms";
import { SampleBadge } from "@/components/sample-badge";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { CHANNELS_MANAGE } from "@/lib/channels";
import { can } from "@/lib/viewer";
import { INSTALLED_KINDS } from "@/sample/channel-accounts";
import { inboundStats, settlementSummary } from "@/sample/channels";
import { CHANNEL_TABS, ENDPOINTS_48, ownerOrgOptions } from "./shared";
import "@/components/catalog/catalog.css";
import "@/components/orders/orders.css";
import "@/components/channels/channels.css";

// Màn "Kênh bán" (bản thiết kế Channels): bán cùng lúc trên website và các sàn, mạng xã hội mà vẫn một kho,
// một danh sách sản phẩm, đơn về một chỗ. Cả màn dựng bằng dữ liệu mẫu (W-006, W-019) vì core chưa có
// module `channels` (bước 48). Mỗi tab một đường dẫn con, theo permission của tab.
export default async function ChannelsLayout({ children }: { children: ReactNode }) {
  const gate = await commerceGate(Object.values(CHANNEL_TABS).flat());
  if (gate) return gate;
  const [t, show, manage, orgs, inbound, summary] = await Promise.all([
    getTranslations("channels"),
    Promise.all(Object.values(CHANNEL_TABS).map((p) => can(p))),
    can(CHANNELS_MANAGE),
    ownerOrgOptions(),
    inboundStats(),
    settlementSummary(),
  ]);
  const [accounts, listings, stock, inboundTab, settlements, report] = show;
  const tabs: PageTab[] = [
    ...(accounts ? [{ href: "/sales/channels", label: t("tabs.accounts") }] : []),
    ...(listings ? [{ href: "/sales/channels/listings", label: t("tabs.listings") }] : []),
    ...(stock ? [{ href: "/sales/channels/stock", label: t("tabs.stock") }] : []),
    ...(inboundTab
      ? [{ href: "/sales/channels/inbound", label: t("tabs.inbound"), badge: String(inbound.open) }]
      : []),
    ...(settlements
      ? [
          {
            href: "/sales/channels/settlements",
            label: t("tabs.settlements"),
            badge: String(summary.open_mismatches),
          },
        ]
      : []),
    ...(report ? [{ href: "/sales/channels/report", label: t("tabs.report") }] : []),
  ];
  return (
    <div className="page cat-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb ell">{t("crumb")}</span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description")}</p>
          <span className="cat-sample">
            <SampleBadge step="48" endpoint={ENDPOINTS_48} />
          </span>
        </div>
        {manage ? (
          <div className="headacts">
            <ConnectDialog
              kinds={INSTALLED_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
              orgs={orgs}
            />
            <SyncNowButton />
          </div>
        ) : null}
      </section>
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
