import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { SampleBadge } from "@/components/sample-badge";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { formatCount } from "@/lib/format";
import { ORDERS_POS_SELL } from "@/lib/orders";
import { can } from "@/lib/viewer";
import { orderSummary } from "@/sample/orders";
import { ENDPOINTS_45, ORDER_TABS } from "../shared";
import "@/components/catalog/catalog.css";
import "@/components/promotions/promotions.css";
import "@/components/orders/orders.css";

// Màn "Đơn hàng": cả màn dựng bằng dữ liệu mẫu (W-006, W-017) vì core chưa có module `orders` (bước
// 45). Bốn tab, mỗi tab một đường dẫn con: đơn hàng, đổi trả và hoàn tiền, bán tại quầy, giỏ bỏ dở.
export default async function OrdersLayout({ children }: { children: ReactNode }) {
  const gate = await commerceGate(Object.values(ORDER_TABS).flat());
  if (gate) return gate;
  const [t, locale, summary, orders, returns, pos, carts] = await Promise.all([
    getTranslations("orders"),
    getLocale(),
    orderSummary(),
    can(ORDER_TABS.orders),
    can(ORDER_TABS.returns),
    can(ORDER_TABS.pos),
    can(ORDER_TABS.carts),
  ]);
  const tabs: PageTab[] = [
    ...(orders ? [{ href: "/sales/orders", label: t("tabs.orders") }] : []),
    ...(returns
      ? [
          {
            href: "/sales/orders/returns",
            label: t("tabs.returns"),
            badge: String(summary.returns_open),
          },
        ]
      : []),
    ...(pos ? [{ href: "/sales/orders/pos", label: t("tabs.pos") }] : []),
    ...(carts
      ? [{ href: "/sales/orders/carts", label: t("tabs.carts"), badge: String(summary.carts) }]
      : []),
  ];
  return (
    <div className="page cat-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb ell">{t("crumb")}</span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">
            {t("description", {
              total: formatCount(summary.last_30_days, locale),
              pending: formatCount(summary.pending, locale),
            })}
          </p>
          <span className="cat-sample">
            <SampleBadge step="45" endpoint={ENDPOINTS_45} />
          </span>
        </div>
        {(await can(ORDERS_POS_SELL)) ? (
          <div className="headacts">
            <Link className="btn pri" href="/sales/orders/pos">
              {t("pos.button")}
            </Link>
          </div>
        ) : null}
      </section>
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
