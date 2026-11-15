import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AdjustDialog, ReceiptDialog } from "@/components/inventory/forms";
import { SampleBadge } from "@/components/sample-badge";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import {
  INVENTORY_ADJUST,
  INVENTORY_PURCHASING_READ,
  INVENTORY_READ,
  INVENTORY_RECEIVE,
} from "@/lib/catalog";
import { can } from "@/lib/viewer";
import { commerceGate } from "../gate";
import { ENDPOINTS_42 } from "../shared";
import { inventoryOptions } from "./options";
import "@/components/catalog/catalog.css";

// Màn "Tồn kho": cả màn dựng bằng dữ liệu mẫu (W-006) vì core chưa có module `inventory` (bước
// 42). Kho và cửa hàng là nút của cây tổ chức mẫu; biến thể lấy từ dữ liệu mẫu của Sản phẩm.
export default async function InventoryLayout({ children }: { children: ReactNode }) {
  const gate = await commerceGate(INVENTORY_READ);
  if (gate) return gate;
  const t = await getTranslations("inventory");
  const [adjust, receive, purchasing, options] = await Promise.all([
    can(INVENTORY_ADJUST),
    can(INVENTORY_RECEIVE),
    can(INVENTORY_PURCHASING_READ),
    inventoryOptions(),
  ]);
  const tabs: PageTab[] = [
    { href: "/catalog/inventory", label: t("tabs.levels") },
    { href: "/catalog/inventory/moves", label: t("tabs.moves") },
    { href: "/catalog/inventory/transfers", label: t("tabs.transfers") },
    { href: "/catalog/inventory/counts", label: t("tabs.counts") },
    { href: "/catalog/inventory/lots", label: t("tabs.lots") },
    ...(purchasing
      ? [
          { href: "/catalog/inventory/purchasing", label: t("tabs.purchasing") },
          { href: "/catalog/inventory/suppliers", label: t("tabs.suppliers") },
        ]
      : []),
  ];
  return (
    <ToastProvider>
      <div className="page cat-page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{t("crumb", { count: options.warehouses.length })}</span>
            <h1 className="h1">{t("title")}</h1>
            <p className="pdesc">{t("description")}</p>
            <span className="cat-sample">
              <SampleBadge step="42" endpoint={ENDPOINTS_42} />
            </span>
          </div>
          {adjust || receive ? (
            <div className="headacts">
              {adjust ? (
                <AdjustDialog
                  warehouses={options.warehouses}
                  label={t("adjust.button")}
                  triggerClass="btn"
                />
              ) : null}
              {receive ? (
                <ReceiptDialog
                  orders={options.orders}
                  suppliers={options.suppliers}
                  warehouses={options.warehouses}
                  reference=""
                  primary
                />
              ) : null}
            </div>
          ) : null}
        </section>
        <PageTabs tabs={tabs} label={t("tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
