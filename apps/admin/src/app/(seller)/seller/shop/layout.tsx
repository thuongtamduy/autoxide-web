import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SellerHead } from "@/components/market/seller";
import { PageTabs } from "@/components/ui/page-tabs";
import { sellerContext } from "@/lib/seller";

// "Gian hàng" của Trung tâm người bán: thông tin công khai, giao hàng, tài khoản nhận tiền; điểm vi phạm.
export default async function SellerShopLayout({ children }: { children: ReactNode }) {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const t = await getTranslations("seller");
  return (
    <div className="page mk-page">
      <SellerHead title={t("shop.title")} description={t("shop.description")} />
      <PageTabs
        label={t("shop.tabs")}
        tabs={[
          { href: "/seller/shop", label: t("shop.tabShop") },
          { href: "/seller/shop/performance", label: t("shop.tabPerformance") },
        ]}
      />
      {children}
    </div>
  );
}
