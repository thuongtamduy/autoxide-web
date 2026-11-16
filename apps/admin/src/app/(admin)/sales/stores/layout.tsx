import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { OpenShiftDialog } from "@/components/orders/forms";
import { SampleBadge } from "@/components/sample-badge";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { can } from "@/lib/viewer";
import { listPickups, returnCounts } from "@/sample/orders";
import { reviewCounts } from "@/sample/stores";
import { ENDPOINTS_45, STORE_TABS, storeOptions } from "../orders/shared";
import "@/components/catalog/catalog.css";
import "@/components/promotions/promotions.css";
import "@/components/orders/orders.css";

// Màn "Cửa hàng" (bản thiết kế StoreOps, "Vận hành cửa hàng"): việc tại quầy và sau bán — nhận tại cửa
// hàng, ca thu ngân, đổi trả tại quầy, kiểm duyệt đánh giá. Cả màn dựng bằng dữ liệu mẫu (W-006, W-017)
// vì core chưa có module `orders` (bước 45). Mỗi tab một đường dẫn con, theo permission của tab.
export default async function StoresLayout({ children }: { children: ReactNode }) {
  const gate = await commerceGate(Object.values(STORE_TABS));
  if (gate) return gate;
  const [t, pickup, shifts, returns, reviews, pickups, retCounts, revCounts, stores] =
    await Promise.all([
      getTranslations("stores"),
      can(STORE_TABS.pickup),
      can(STORE_TABS.shifts),
      can(STORE_TABS.returns),
      can(STORE_TABS.reviews),
      listPickups(),
      returnCounts("in_store"),
      reviewCounts(),
      storeOptions(),
    ]);
  const waiting = pickups.data.filter(
    (o) => o.pickup?.status === "ready" || o.pickup?.status === "preparing",
  ).length;
  const tabs: PageTab[] = [
    ...(pickup ? [{ href: "/sales/stores", label: t("tabs.pickup"), badge: String(waiting) }] : []),
    ...(shifts ? [{ href: "/sales/stores/shifts", label: t("tabs.shifts") }] : []),
    ...(returns
      ? [
          {
            href: "/sales/stores/returns",
            label: t("tabs.returns"),
            badge: String(retCounts.requested + retCounts.approved + retCounts.received),
          },
        ]
      : []),
    ...(reviews
      ? [{ href: "/sales/stores/reviews", label: t("tabs.reviews"), badge: String(revCounts.new) }]
      : []),
  ];
  return (
    <div className="page cat-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb ell">
            {t("crumb", { stores: stores.map((s) => s.label).join(", ") })}
          </span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description")}</p>
          <span className="cat-sample">
            <SampleBadge step="45" endpoint={ENDPOINTS_45} />
          </span>
        </div>
        {shifts ? (
          <div className="headacts">
            <OpenShiftDialog stores={stores} />
          </div>
        ) : null}
      </section>
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
