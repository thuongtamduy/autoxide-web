import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { SampleBadge } from "@/components/sample-badge";
import { ShipmentDialog } from "@/components/shipping/forms";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { SHIPPING_SHIPMENTS_MANAGE } from "@/lib/shipping";
import { can } from "@/lib/viewer";
import { activeMethods, originOptions } from "@/sample/shipping";
import { ENDPOINTS_44, provinceOptions, TAB_PERMISSIONS } from "./shared";
import "@/components/catalog/catalog.css";
import "@/components/promotions/promotions.css";

// Màn "Vận chuyển": cả màn dựng bằng dữ liệu mẫu (W-006, W-015) vì core chưa có module `shipping`
// (bước 44). Vận đơn trỏ tới đơn mẫu của `sample/order-refs.ts`; màn Đơn hàng (bước 45) dựng sau.
export default async function ShippingLayout({ children }: { children: ReactNode }) {
  const gate = await commerceGate(Object.values(TAB_PERMISSIONS).flat());
  if (gate) return gate;
  const [t, locale] = await Promise.all([getTranslations("shipping"), getLocale()]);
  const [shipments, rates, calendar, cod, carriers, manage, origins, methods] = await Promise.all([
    can(TAB_PERMISSIONS.shipments),
    can(TAB_PERMISSIONS.rates),
    can(TAB_PERMISSIONS.calendar),
    can(TAB_PERMISSIONS.cod),
    can(TAB_PERMISSIONS.carriers),
    can(SHIPPING_SHIPMENTS_MANAGE),
    originOptions(),
    activeMethods(locale),
  ]);
  const tabs: PageTab[] = [
    ...(shipments ? [{ href: "/sales/shipping", label: t("tabs.shipments") }] : []),
    ...(rates ? [{ href: "/sales/shipping/rates", label: t("tabs.rates") }] : []),
    ...(calendar ? [{ href: "/sales/shipping/calendar", label: t("tabs.calendar") }] : []),
    ...(cod ? [{ href: "/sales/shipping/cod", label: t("tabs.cod") }] : []),
    ...(carriers ? [{ href: "/sales/shipping/carriers", label: t("tabs.carriers") }] : []),
  ];
  return (
    <div className="page cat-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb ell">{t("crumb")}</span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description")}</p>
          <span className="cat-sample">
            <SampleBadge step="44" endpoint={ENDPOINTS_44} />
          </span>
        </div>
        {manage ? (
          <div className="headacts">
            <ShipmentDialog
              origins={origins.map((u) => ({ value: u.id, label: u.name }))}
              methods={methods.map((m) => ({ value: m.id, label: m.label }))}
              provinces={provinceOptions()}
            />
          </div>
        ) : null}
      </section>
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
