import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SellerHead } from "@/components/market/seller";
import { PageTabs } from "@/components/ui/page-tabs";
import { sellerContext } from "@/lib/seller";
import { listDisputes } from "@/sample/market";

// "Đơn" của Trung tâm người bán: đơn của tôi và tranh chấp cần trả lời — chỉ của nút người bán này.
export default async function SellerOrdersLayout({ children }: { children: ReactNode }) {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const t = await getTranslations("seller");
  const { data: open } = await listDisputes({ seller: ctx.seller.org_id, status: "open" });
  return (
    <div className="page mk-page">
      <SellerHead title={t("orders.title")} description={t("orders.description")} />
      <PageTabs
        label={t("orders.tabs")}
        tabs={[
          { href: "/seller/orders", label: t("orders.tabOrders") },
          {
            href: "/seller/orders/disputes",
            label: t("orders.tabDisputes"),
            ...(open.length > 0 ? { badge: String(open.length) } : {}),
          },
        ]}
      />
      {children}
    </div>
  );
}
