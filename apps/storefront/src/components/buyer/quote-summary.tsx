import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import { LOYALTY, type Quote } from "@/sample/checkout";
import { sellerBySlug } from "@/sample/market";
import { FREE_SHIPPING_OVER } from "@/sample/shipping";

// Tóm tắt tiền của giỏ / đơn đang đặt: tạm tính, giảm, phí giao từng nơi bán, điểm, tổng, thuế đã gồm,
// thanh "còn bao nhiêu để miễn phí giao". Một component cho trang giỏ và trang đặt hàng (dùng được ở
// cả máy chủ và trình duyệt). Tiền luôn qua `.price` (không bẻ dòng).

export function QuoteSummary({
  quote,
  locale,
  siteName,
  delivery,
  children,
}: {
  quote: Quote;
  locale: string;
  siteName: string;
  delivery: "ship" | "pickup";
  /** Nút hành động (Tiếp tục / Đặt hàng) nằm giữa tổng và các ghi chú. */
  children?: ReactNode;
}) {
  const t = useTranslations("checkout.summary");
  const money = (amount: number) => formatMoney({ amount, currency: "VND" }, locale);
  const own = quote.groups.find((g) => g.seller === null);
  const sellers = quote.groups.filter((g) => g.seller !== null);
  const remaining = own?.free_remaining ?? null;
  return (
    <>
      <dl className="by-sums">
        <div>
          <dt>{t("subtotal")}</dt>
          <dd className="price num">{money(quote.subtotal)}</dd>
        </div>
        {quote.discount > 0 ? (
          <div>
            <dt>{t("discount", { code: quote.code?.code ?? "" })}</dt>
            <dd className="price num sale">{money(-quote.discount)}</dd>
          </div>
        ) : null}
        {own ? (
          <div>
            <dt>{t("ownShipping", { name: siteName })}</dt>
            <dd className={own.shipping === null ? "muted" : "price num"}>
              {delivery === "pickup"
                ? t("pickup")
                : own.shipping === null
                  ? t("pickProvince")
                  : own.shipping === 0
                    ? t("free")
                    : money(own.shipping)}
            </dd>
          </div>
        ) : null}
        {sellers.map((group) => (
          <div key={group.seller}>
            <dt>
              {t("sellerShipping", {
                name: sellerBySlug(group.seller ?? "")?.display_name ?? "",
              })}
            </dt>
            <dd className="price num">{money(group.shipping ?? 0)}</dd>
          </div>
        ))}
        {quote.points_used > 0 ? (
          <div>
            <dt>{t("points", { points: quote.points_used })}</dt>
            <dd className="price num sale">{money(-quote.points_value)}</dd>
          </div>
        ) : null}
        <div className="by-sum-total">
          <dt>{t("total")}</dt>
          <dd className="price num dsp">{money(quote.total)}</dd>
        </div>
      </dl>
      {children}
      {own && delivery === "ship" && remaining !== null ? (
        <div className="by-free">
          <span>
            {remaining > 0
              ? t("freeRemaining", { amount: money(remaining), name: siteName })
              : t("freeReached", { name: siteName })}
          </span>
          <span
            className="by-free-bar"
            role="progressbar"
            aria-label={t("freeProgress")}
            aria-valuemin={0}
            aria-valuemax={FREE_SHIPPING_OVER}
            aria-valuenow={FREE_SHIPPING_OVER - remaining}
          >
            <span
              style={{
                width: `${Math.min(100, Math.round(((FREE_SHIPPING_OVER - remaining) / FREE_SHIPPING_OVER) * 100))}%`,
              }}
            />
          </span>
        </div>
      ) : null}
      <span className="muted by-note">
        {t("vat", { percent: quote.vat_percent, amount: money(quote.vat) })}
      </span>
      {sellers.length > 0 ? (
        <span className="muted by-note">{t("split", { count: quote.groups.length })}</span>
      ) : null}
      {quote.points_cap > 0 && quote.points_used === 0 ? (
        <span className="muted by-note">
          {t("pointsHint", {
            cap: quote.points_cap,
            value: money(quote.points_cap * LOYALTY.point_value),
          })}
        </span>
      ) : null}
    </>
  );
}
