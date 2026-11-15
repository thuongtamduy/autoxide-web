import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Forbidden } from "@/components/engage/common";
import { PreviewBar, SellerPicker } from "@/components/market/seller";
import { AdminShell } from "@/components/shell/admin-shell";
import { ToastProvider } from "@/components/ui/toast";
import { MARKETPLACE_SELL, MARKETPLACE_SELLERS_READ } from "@/lib/market";
import { sellerContext } from "@/lib/seller";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { marketName } from "@/sample/market";
import "@/components/catalog/catalog.css";
import "@/components/compliance/compliance.css";
import "@/components/engage/engage.css";
import "@/components/market/market.css";
import "@/components/platform/platform.css";

// Trung tâm người bán (W-018): không gian thứ ba của khung, cho người bán trên sàn — chỉ thấy dữ liệu
// của nút người bán của mình. Cả không gian chờ API của bước 46 (dữ liệu mẫu, W-006): tắt dữ liệu mẫu
// thì không tồn tại. Người xem được hồ sơ người bán thì "Xem như người bán" — băng trên cùng nói rõ đó
// là chế độ thử, không phải quyền của người bán.
export default async function SellerLayout({ children }: { children: ReactNode }) {
  if (!sampleDataEnabled()) notFound();
  const [t, ctx, market, operator] = await Promise.all([
    getTranslations("seller"),
    sellerContext(),
    marketName(),
    can(MARKETPLACE_SELLERS_READ),
  ]);
  const context = ctx
    ? { title: ctx.seller.display_name, sub: t("shell.on", { market }) }
    : undefined;
  return (
    <AdminShell workspace="seller" {...(context ? { context } : {})}>
      <ToastProvider>
        {ctx?.mode === "preview" ? <PreviewBar current={ctx.seller.org_id} /> : null}
        {ctx ? children : operator ? <SellerPicker /> : <Forbidden permission={MARKETPLACE_SELL} />}
      </ToastProvider>
    </AdminShell>
  );
}
