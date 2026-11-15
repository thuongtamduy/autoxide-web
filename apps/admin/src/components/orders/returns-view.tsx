import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  approveReturnAction,
  closeReturnAction,
  refundReturnAction,
} from "@/app/(admin)/sales/orders/actions";
import { RETURN_BADGE } from "@/components/orders/badges";
import { MoneyConfirm, ReceiveReturnDialog, RejectReturnDialog } from "@/components/orders/forms";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatCount, formatMoney } from "@/lib/format";
import { ORDERS_REFUND, ORDERS_RETURNS_MANAGE } from "@/lib/orders";
import { can } from "@/lib/viewer";
import {
  getOrder,
  listReturns,
  MEDIA_REQUIRED_REASONS,
  type OrderReturn,
  RETURN_WINDOW_DAYS,
  type ReturnMethod,
  type ReturnStatus,
  refundDestination,
  returnCounts,
} from "@/sample/orders";

const CHIPS: ReturnStatus[] = [
  "requested",
  "approved",
  "received",
  "refunded",
  "rejected",
  "closed",
];

/**
 * Bảng yêu cầu đổi trả (dùng ở tab "Đổi trả và hoàn tiền" của Đơn hàng và "Đổi trả tại quầy" của Cửa
 * hàng): lọc theo trạng thái, mở một dòng để xem lý do, ảnh / video mở hộp, hạn đổi trả, lịch sử và
 * thao tác. Hoàn tiền qua hộp xác nhận nêu số tiền và nơi tiền về.
 */
export async function ReturnsView({
  base,
  params,
  method,
}: {
  base: string;
  params: Record<string, string | string[] | undefined>;
  method?: ReturnMethod;
}) {
  const [t, locale] = await Promise.all([getTranslations("orders"), getLocale()]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = CHIPS.find((s) => s === one("status"));
  const open = one("open");
  const [list, counts, manage, refund] = await Promise.all([
    listReturns({ ...(status ? { status } : {}), ...(method ? { method } : {}) }),
    returnCounts(method),
    can(ORDERS_RETURNS_MANAGE),
    can(ORDERS_REFUND),
  ]);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: status ?? "", ...change };
    for (const [key, v] of Object.entries(merged)) if (v) next.set(key, v);
    const q = next.toString();
    return q ? `${base}?${q}` : base;
  };
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const refunded = list.data
    .filter((r) => r.status === "refunded" || r.status === "closed")
    .reduce((s, r) => s + Number(r.refund_amount.amount), 0);
  return (
    <div className="blocks">
      <section className="block" aria-label={t("returns.kpis")}>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("returnStatus.requested")}</span>
            <b className="kpi-value">{formatCount(counts.requested, locale)}</b>
            <span className="kpi-sub">{t("returns.kpiRequested")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("returnStatus.approved")}</span>
            <b className="kpi-value">{formatCount(counts.approved, locale)}</b>
            <span className="kpi-sub">{t("returns.kpiApproved")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("returnStatus.received")}</span>
            <b className="kpi-value">{formatCount(counts.received, locale)}</b>
            <span className="kpi-sub">{t("returns.kpiReceived")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("returns.kpiRefunded")}</span>
            <b className="kpi-value">{money(String(refunded))}</b>
            <span className="kpi-sub">{t("returns.kpiRefundedSub")}</span>
          </div>
        </div>
      </section>
      <section className="block" aria-labelledby="returns-h">
        <div className="block-head">
          <h2 id="returns-h" className="h2">
            {t("returns.title")}
          </h2>
        </div>
        <p className="fhint">{t("returns.about", { days: RETURN_WINDOW_DAYS })}</p>
        <nav className="chips" aria-label={t("returns.byStatus")}>
          <Link
            className={status ? "chip" : "chip on"}
            href={href({ status: null })}
            aria-current={status ? undefined : "page"}
          >
            {t("returns.all")} <span className="cnt">{counts.all}</span>
          </Link>
          {CHIPS.map((s) => (
            <Link
              key={s}
              className={status === s ? "chip on" : "chip"}
              href={href({ status: s })}
              aria-current={status === s ? "page" : undefined}
            >
              {t(`returnStatus.${s}`)} <span className="cnt">{counts[s]}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {list.data.length === 0 ? (
            <p className="empty">{t("returns.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("returns.request")}</Th>
                  <Th>{t("returns.reason")}</Th>
                  <Th>{t("returns.method")}</Th>
                  <Th className="text-right">{t("returns.amount")}</Th>
                  <Th>{t("returns.due")}</Th>
                  <Th>{t("returns.state")}</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((r) => {
                  const isOpen = open === r.id;
                  return [
                    <tr key={r.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open mono"
                            href={isOpen ? href({}) : `${href({ open: r.id })}#returns-h`}
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {r.number}
                          </Link>
                          <span className="sub">
                            <span className="mono">{r.order_number}</span> · {r.buyer_name}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("returns.reason")}>
                        <span className="cell2">
                          <span>{t(`returns.reasons.${r.reason_code}`)}</span>
                          <span className="sub">
                            {r.media.length > 0
                              ? t("returns.mediaCount", { n: r.media.length })
                              : t("returns.noMedia")}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("returns.method")}>
                        <span className="cell2">
                          <span>{t(`returns.methods.${r.return_method}`)}</span>
                          <span className="sub">{t(`returns.resolutions.${r.resolution}`)}</span>
                        </span>
                      </Td>
                      <Td label={t("returns.amount")} className="text-right num">
                        {r.resolution === "exchange"
                          ? t("returns.exchange")
                          : money(r.refund_amount.amount)}
                      </Td>
                      <Td label={t("returns.due")}>
                        {r.status === "requested" ? (
                          <Time value={r.respond_by} />
                        ) : (
                          t("returns.handled")
                        )}
                      </Td>
                      <Td label={t("returns.state")}>
                        <span className={RETURN_BADGE[r.status]}>
                          <span className="dot" />
                          {t(`returnStatus.${r.status}`)}
                        </span>
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${r.id}-open`} className="cat-detail-row">
                        <td colSpan={6}>
                          <Detail r={r} locale={locale} manage={manage} refund={refund} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          )}
        </div>
        <p className="note">
          <b>{t("returns.policyStrong")}</b>{" "}
          {t("returns.policy", {
            days: RETURN_WINDOW_DAYS,
            reasons: MEDIA_REQUIRED_REASONS.map((x) => t(`returns.reasons.${x}`)).join(", "),
          })}
        </p>
      </section>
    </div>
  );
}

async function Detail({
  r,
  locale,
  manage,
  refund,
}: {
  r: OrderReturn;
  locale: string;
  manage: boolean;
  refund: boolean;
}) {
  const t = await getTranslations("orders");
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const order = (await getOrder(r.order_id))?.data;
  const via = order
    ? t(
        `refund.via.${order.funds_flow === "partner_collect" && order.payment_method !== "cod" ? "partner" : order.payment_method}`,
      )
    : "";
  const destination = order
    ? t(`refund.dest.${refundDestination(order.payment_method)}`, { via })
    : "";
  const fields: [string, ReactNode][] = [
    [
      t("returns.order"),
      <Link key="o" className="mono" href={`/sales/orders/${r.order_id}`}>
        {r.order_number}
      </Link>,
    ],
    [t("returns.buyerNote"), r.buyer_note || "—"],
    [t("returns.method"), `${t(`returns.methods.${r.return_method}`)} · ${r.return_to}`],
    [t("returns.resolution"), t(`returns.resolutions.${r.resolution}`)],
    [t("returns.window"), <Time key="w" value={r.return_deadline_at} />],
  ];
  if (r.reject)
    fields.push([
      t("returns.rejectReason"),
      `${t(`returns.rejectReasons.${r.reject.code}`)} — ${r.reject.note}`,
    ]);
  if (r.decided_by) fields.push([t("returns.decidedBy"), r.decided_by.name]);
  return (
    <div className="cat-detail">
      <h3 className="h2">
        {t("returns.detailTitle", { number: r.number, order: r.order_number })}
      </h3>
      <dl className="cat-kv">
        {fields.map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
      </dl>
      <h4 className="pm-h">{t("returns.lines")}</h4>
      <ul className="cat-lines">
        {r.lines.map((l) => (
          <li key={l.line_id}>
            <span>
              {l.name} × {l.quantity}
              {l.condition ? ` · ${t(`returns.conditions.${l.condition}`)}` : ""}
            </span>
            <b className="num">{money(l.amount.amount)}</b>
          </li>
        ))}
      </ul>
      <h4 className="pm-h">{t("returns.media")}</h4>
      {r.media.length > 0 ? (
        <ul className="ord-media">
          {r.media.map((m) => (
            <li key={m.id}>
              <span aria-hidden="true">{m.kind === "video" ? "▶" : "▣"}</span>
              <span>{t(`returns.mediaKind.${m.kind}`)}</span>
              <span className="mono">{m.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fhint">
          {MEDIA_REQUIRED_REASONS.includes(r.reason_code)
            ? t("returns.mediaMissing")
            : t("returns.noMedia")}
        </p>
      )}
      <h4 className="pm-h">{t("returns.history")}</h4>
      <ol className="timeline">
        {[...r.history].reverse().map((h) => (
          <li key={`${h.at}-${h.event}`}>
            <span>
              <b>{h.by}</b> {t(`activity.return.${h.event}`, { number: r.number })}
            </span>
            <span className="sub">
              <Time value={h.at} />
            </span>
          </li>
        ))}
      </ol>
      <span className="row-acts">
        {manage && r.status === "requested" && r.return_method !== "in_store" ? (
          <ConfirmAction
            action={approveReturnAction}
            id={r.id}
            label={t("returns.approve")}
            title={t("returns.approveTitle", { number: r.number })}
            points={[
              t(`returns.approveNext.${r.return_method}`, { place: r.return_to }),
              t("returns.approveBuyer"),
            ]}
            submit={t("returns.approveSubmit")}
            done={t("returns.approved")}
            danger={false}
          />
        ) : null}
        {manage &&
        (r.status === "approved" ||
          (r.status === "requested" && r.return_method === "in_store")) ? (
          <ReceiveReturnDialog
            id={r.id}
            number={r.number}
            inStore={r.return_method === "in_store"}
          />
        ) : null}
        {manage && r.status === "requested" ? (
          <RejectReturnDialog id={r.id} number={r.number} />
        ) : null}
        {refund && r.status === "received" && r.resolution === "refund" ? (
          <MoneyConfirm
            action={refundReturnAction}
            fields={{ id: r.id }}
            label={t("returns.refund")}
            title={t("returns.refundTitle", {
              amount: money(r.refund_amount.amount),
              number: r.order_number,
            })}
            rows={[
              [t("refund.order"), r.order_number],
              [t("refund.buyer"), r.buyer_name],
              [t("refund.amount"), money(r.refund_amount.amount)],
              [t("refund.to"), destination],
              [t("refund.permission"), "orders.refund"],
            ]}
            body={t("returns.refundBody")}
            warn={t("refund.warn")}
            submit={t("refund.submit", { amount: money(r.refund_amount.amount) })}
            done={t("returns.refunded")}
          />
        ) : null}
        {manage &&
        (r.status === "refunded" || (r.status === "received" && r.resolution === "exchange")) ? (
          <InlineAction
            action={closeReturnAction}
            id={r.id}
            label={t("returns.close")}
            done={t("returns.closed")}
          />
        ) : null}
      </span>
    </div>
  );
}
