import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { AddCustomerDialog } from "@/components/customers/forms";
import { SampleBadge } from "@/components/sample-badge";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import { CUSTOMERS_MANAGE } from "@/lib/customers";
import { can } from "@/lib/viewer";
import { listReferrals } from "@/sample/customers";
import { listCarts } from "@/sample/orders";
import { CUSTOMER_TABS, ENDPOINTS_47, storeOptions } from "./shared";
import "@/components/engage/engage.css";
import "@/components/catalog/catalog.css";
import "@/components/orders/orders.css";
import "@/components/customers/customers.css";

// Màn "Khách hàng" (bản thiết kế Customers): hồ sơ khách và giữ chân khách. Cả màn dựng bằng dữ liệu mẫu
// (W-006, W-019) vì core chưa có module `customers` (bước 47). Mỗi tab một đường dẫn con, theo permission
// của tab; chi tiết một dòng mở bằng `?open=`. Danh sách giỏ bỏ dở là của màn Đơn hàng (không làm lại).
export default async function CustomersLayout({ children }: { children: ReactNode }) {
  const gate = await commerceGate(Object.values(CUSTOMER_TABS).flat());
  if (gate) return gate;
  const [t, show, manage, stores, carts, referrals] = await Promise.all([
    getTranslations("customers"),
    Promise.all(Object.values(CUSTOMER_TABS).map((p) => can(p))),
    can(CUSTOMERS_MANAGE),
    storeOptions(),
    listCarts(),
    listReferrals(),
  ]);
  const [profiles, accounts, segments, loyalty, cartsTab, referralsTab, cod] = show;
  const waiting = carts.data.filter((c) => c.consent && c.reminders_sent === 0).length;
  const tabs: PageTab[] = [
    ...(profiles ? [{ href: "/customers", label: t("tabs.profiles") }] : []),
    ...(accounts ? [{ href: "/customers/accounts", label: t("tabs.accounts") }] : []),
    ...(segments ? [{ href: "/customers/segments", label: t("tabs.segments") }] : []),
    ...(loyalty ? [{ href: "/customers/loyalty", label: t("tabs.loyalty") }] : []),
    ...(cartsTab
      ? [{ href: "/customers/carts", label: t("tabs.carts"), badge: String(waiting) }]
      : []),
    ...(referralsTab
      ? [
          {
            href: "/customers/referrals",
            label: t("tabs.referrals"),
            badge: String(referrals.data.filter((r) => r.status === "qualified").length),
          },
        ]
      : []),
    ...(cod ? [{ href: "/customers/cod", label: t("tabs.cod") }] : []),
  ];
  return (
    <ToastProvider>
      <div className="page cat-page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{t("crumb")}</span>
            <h1 className="h1">{t("title")}</h1>
            <p className="pdesc">{t("description")}</p>
            <span className="cat-sample">
              <SampleBadge step="47" endpoint={ENDPOINTS_47} />
            </span>
          </div>
          {manage ? (
            <div className="headacts">
              <AddCustomerDialog stores={stores} />
            </div>
          ) : null}
        </section>
        <PageTabs tabs={tabs} label={t("tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
