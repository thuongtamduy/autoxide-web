import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { formatMoney, keepUnits } from "@/lib/format";
import { text } from "@/sample";
import { storeByCode } from "@/sample/catalog";
import { sellerBySlug } from "@/sample/market";
import { type BuyerOrder, type OrderStatus, timeline } from "@/sample/orders";
import { Badge, type BadgeTone } from "../badge";
import { Art, Icon } from "../icon";
import { Price } from "../price";
import { DayRange, formatDateTime } from "./day-range";

// Một đơn hàng như người mua thấy: mã, nơi bán, trạng thái, các mốc, ngày giao / vận đơn, món, tiền,
// nơi nhận. Dùng chung cho trang tài khoản, tra cứu đơn và "đặt hàng thành công" (một cách hiện cho
// mọi chỗ). Không có trạng thái riêng nên dùng được trong Server Component và Client Component.

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending_payment: "warn",
  confirmed: "brand",
  preparing: "brand",
  shipping: "brand",
  ready_for_pickup: "brand",
  delivered: "ok",
  completed: "ok",
  cancelled: "bad",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("order.status");
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span className="dot" aria-hidden="true" />
      {t(status)}
    </Badge>
  );
}

/** Tên nơi bán của đơn: Bếp Mộc hay tên người bán. */
export function useSellerLabel(): (seller: string | null, siteName: string) => string {
  return (seller, siteName) => (seller ? (sellerBySlug(seller)?.display_name ?? seller) : siteName);
}

export function OrderTimeline({ order, locale }: { order: BuyerOrder; locale: string }) {
  const t = useTranslations("order.timeline");
  const steps = timeline(order);
  const reached = steps.filter((step) => step.at).length;
  return (
    <ol className="by-tl" aria-label={t("label")}>
      {steps.map((step, index) => {
        const done = step.at !== null;
        const current = index === reached - 1 && order.status !== "cancelled";
        return (
          <li
            key={step.key}
            className={done ? "done" : ""}
            aria-current={current ? "step" : undefined}
          >
            <span className="by-tl-bar" aria-hidden="true" />
            <span className="by-tl-label">{t(step.key)}</span>
            <span className="muted num by-tl-at">
              {step.at ? formatDateTime(step.at, locale, true) : t("pending")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderView({
  order,
  locale,
  siteName,
  children,
  compact = false,
  head = true,
}: {
  order: BuyerOrder;
  locale: string;
  siteName: string;
  /** Nút hành động (huỷ, đổi trả…) ở cuối thẻ. */
  children?: ReactNode;
  /** Bỏ phần nơi nhận và hoá đơn (trang "đặt hàng thành công" đã có tóm tắt). */
  compact?: boolean;
  /** Hiện mã đơn và trạng thái ở đầu (tắt khi nơi chứa đã có, vd dòng tóm tắt ở trang tài khoản). */
  head?: boolean;
}) {
  const t = useTranslations("order");
  const seller = useSellerLabel()(order.seller, siteName);
  const money = (amount: number) => formatMoney({ amount, currency: "VND" }, locale);
  return (
    <div className="by-order">
      {head ? (
        <div className="by-order-head">
          <span className="by-order-id">
            <span className="num dsp by-order-no">{order.number}</span>
            <span className="muted">
              {t("meta", {
                when: formatDateTime(order.placed_at, locale),
                seller,
                payment: t(`payment.${order.payment_method}`),
              })}
            </span>
          </span>
          <OrderStatusBadge status={order.status} />
        </div>
      ) : null}
      {order.status !== "cancelled" ? <OrderTimeline order={order} locale={locale} /> : null}
      {order.status !== "cancelled" &&
      order.status !== "completed" &&
      order.status !== "delivered" ? (
        <p className="by-order-eta">
          <Icon name={order.delivery.kind === "pickup" ? "store" : "truck"} small />
          <span>
            {order.delivery.kind === "pickup" ? (
              t("pickupAt", { store: text(storeByCode(order.delivery.store).name, locale) })
            ) : order.eta ? (
              <>
                {t("eta")} <DayRange days={order.eta} locale={locale} />
              </>
            ) : (
              t("etaUnknown")
            )}
            {order.tracking ? (
              <>
                {" · "}
                {t("tracking", { carrier: order.tracking.carrier })}{" "}
                <b className="num">{order.tracking.number}</b>
              </>
            ) : order.delivery.kind === "ship" ? (
              ` · ${t("trackingLater")}`
            ) : null}
          </span>
        </p>
      ) : null}
      <ul className="by-lines" aria-label={t("items")}>
        {order.lines.map((line) => (
          <li key={line.sku} className="by-line">
            <span className={`thumb ${line.tone}`}>
              <Art name={line.art} />
            </span>
            <span className="by-line-name">
              {keepUnits(text(line.names, locale))}
              {line.option ? <span className="muted"> · {text(line.option, locale)}</span> : null}
            </span>
            <span className="num muted">× {line.quantity}</span>
            <Price money={{ amount: line.amount, currency: "VND" }} locale={locale} />
          </li>
        ))}
      </ul>
      <dl className="by-sums">
        <div>
          <dt>{t("goods")}</dt>
          <dd className="price num">{money(order.goods)}</dd>
        </div>
        {order.discount > 0 ? (
          <div>
            <dt>{t("discount")}</dt>
            <dd className="price num sale">{money(-order.discount)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("shipping")}</dt>
          <dd className="price num">
            {order.shipping === 0 ? t("shippingFree") : money(order.shipping)}
          </dd>
        </div>
        {order.points_value > 0 ? (
          <div>
            <dt>{t("points")}</dt>
            <dd className="price num sale">{money(-order.points_value)}</dd>
          </div>
        ) : null}
        <div className="by-sum-total">
          <dt>{order.paid ? t("totalPaid") : t("total")}</dt>
          <dd className="price num">{money(order.total)}</dd>
        </div>
      </dl>
      {compact ? null : (
        <div className="by-order-facts">
          <span>
            <b>{order.delivery.kind === "pickup" ? t("pickupTitle") : t("shipTo")}</b>
            <span>
              {order.contact.name} · <span className="num">{order.contact.phone}</span>
            </span>
            <span>
              {order.delivery.kind === "pickup"
                ? text(storeByCode(order.delivery.store).address, locale)
                : [
                    order.delivery.street,
                    text(order.delivery.ward, locale),
                    text(order.delivery.province, locale),
                  ]
                    .filter(Boolean)
                    .join(", ")}
            </span>
          </span>
          {head ? null : (
            <span>
              <b>{t("paymentTitle")}</b>
              <span>
                {t("placedAt", { when: formatDateTime(order.placed_at, locale) })} ·{" "}
                {t(`payment.${order.payment_method}`)}
              </span>
            </span>
          )}
          <span>
            <b>{t("invoice")}</b>
            <span>
              {order.invoice
                ? t("invoiceCompany", { company: order.invoice.company || order.invoice.tax_code })
                : t("invoicePerson")}
            </span>
          </span>
        </div>
      )}
      {children ? <div className="by-order-acts">{children}</div> : null}
    </div>
  );
}
