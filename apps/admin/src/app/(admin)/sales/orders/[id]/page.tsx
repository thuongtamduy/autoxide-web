import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import {
  cancelOrderAction,
  deliveredAction,
  orderStatusAction,
  proposalAction,
  redeliverAction,
  resendLinkAction,
} from "@/app/(admin)/sales/orders/actions";
import { ChangeButtons, type Move } from "@/components/engage/actions";
import { ORDER_BADGE, PAY_BADGE, RETURN_BADGE } from "@/components/orders/badges";
import {
  ApproveProposal,
  ManualPaymentDialog,
  NoteForm,
  RefundDialog,
} from "@/components/orders/forms";
import { SampleBadge } from "@/components/sample-badge";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatMoney } from "@/lib/format";
import { ORDERS_MANAGE, ORDERS_READ, ORDERS_REFUND, type OrderStatus } from "@/lib/orders";
import { can } from "@/lib/viewer";
import { getOrder, ledgerOf, refundDestination, returnsOf } from "@/sample/orders";
import { listShipments } from "@/sample/shipping";
import { ENDPOINTS_45 } from "../shared";
import "@/components/catalog/catalog.css";
import "@/components/promotions/promotions.css";
import "@/components/orders/orders.css";

const STEPS = [
  "placed",
  "paid",
  "confirmed",
  "preparing",
  "shipping",
  "delivered",
  "completed",
] as const;
const REACHED: Record<OrderStatus, number> = {
  pending_payment: 1,
  awaiting_acceptance: 2,
  confirmed: 3,
  preparing: 4,
  shipping: 5,
  delivery_failed: 5,
  delivered: 6,
  completed: 7,
  cancelled: 0,
};

// Chi tiết một đơn (trang riêng, mở thẳng được): tiến trình, dòng hàng với giá và thuế chụp lúc đặt,
// khuyến mại đã áp, dòng tiền (D-187: tiền qua đối tác có giấy phép, hệ thống không giữ tiền), vận đơn,
// hoá đơn, bút toán sổ cái, hoạt động và ghi chú nội bộ. Thao tác đảo được có Hoàn tác; hoàn tiền qua
// hộp xác nhận nêu số tiền và nơi tiền về.
export default async function OrderPage(props: PageProps<"/sales/orders/[id]">) {
  const gate = await commerceGate(ORDERS_READ);
  if (gate) return gate;
  const { id } = await props.params;
  const found = await getOrder(id);
  if (!found) notFound();
  const o = found.data;
  const [t, ts, locale, returns, shipments, manage, refund] = await Promise.all([
    getTranslations("orders"),
    getTranslations("shipping"),
    getLocale(),
    returnsOf(o.id),
    listShipments({ q: o.number }),
    can(ORDERS_MANAGE),
    can(ORDERS_REFUND),
  ]);
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const mine = shipments.data.filter((x) => x.order_number === o.number);
  const remaining = Number(o.paid.amount) - Number(o.refunded.amount);
  const proposal = returns.find(
    (r) => r.proposal?.status === "pending" || r.proposal?.status === "rejected",
  );
  const reached = REACHED[o.status];
  const via = t(
    `refund.via.${o.funds_flow === "partner_collect" && o.payment_method !== "cod" ? "partner" : o.payment_method}`,
  );
  const destination = t(
    `refund.dest.${o.refunds.at(-1)?.destination ?? refundDestination(o.payment_method)}`,
    { via },
  );
  const ledger = ledgerOf(o);
  const vatByRate = new Map<string, number>();
  for (const l of o.lines)
    for (const x of l.taxes)
      vatByRate.set(x.rate, (vatByRate.get(x.rate) ?? 0) + Number(x.amount.amount));
  const activity = [
    ...o.notes.map((n) => ({ id: n.id, at: n.at, who: n.author.name, text: n.text, note: true })),
    ...o.history.map((h) => ({
      id: h.id,
      at: h.at,
      who: h.actor?.name ?? t(`causes.${h.cause}`),
      text: h.undo
        ? t("activity.undo", { status: t(`status.${h.to}`) })
        : t("activity.moved", { status: t(`status.${h.to}`) }),
      note: false,
    })),
    ...o.refunds.map((r) => ({
      id: r.id,
      at: r.created_at,
      who: r.created_by.name,
      text: t("activity.refunded", { amount: money(r.amount.amount) }),
      note: false,
    })),
    ...returns.flatMap((r) =>
      r.history.map((h, i) => ({
        id: `${r.id}-${i}`,
        at: h.at,
        who: h.by,
        text: t(`activity.return.${h.event}`, { number: r.number }),
        note: false,
      })),
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const moves: Record<string, Move[]> = {
    awaiting_acceptance: [
      { value: "confirmed", label: t("actions.accept"), done: t("actions.accepted"), tone: "pri" },
    ],
    confirmed: [
      {
        value: "preparing",
        label: t("actions.prepare"),
        done: t("actions.preparing"),
        tone: "pri",
      },
    ],
    preparing: o.pickup
      ? []
      : [{ value: "shipping", label: t("actions.selfShip"), done: t("actions.shipped") }],
  };
  return (
    <div className="page cat-page">
      <section className="phead">
        <div className="phead-main">
          <Link className="crumb" href="/sales/orders">
            ← {t("title")}
          </Link>
          <h1 className="h1 mono">{o.number}</h1>
          <p className="pdesc">
            <span className={ORDER_BADGE[o.status]}>
              <span className="dot" />
              {t(`status.${o.status}`)}
            </span>{" "}
            <span className={PAY_BADGE[o.payment_status]}>{t(`pay.${o.payment_status}`)}</span>{" "}
            {o.buyer.name} · {t(`channel.${o.channel}`)} ·{" "}
            {o.seller ? `${o.org_name} · ${o.seller.name}` : o.org_name} ·{" "}
            <Time value={o.placed_at} />
          </p>
          <span className="cat-sample">
            <SampleBadge step="45" endpoint={ENDPOINTS_45} />
          </span>
        </div>
        {manage ? (
          <div className="headacts">
            {moves[o.status]?.length ? (
              <ChangeButtons
                action={orderStatusAction}
                id={o.id}
                expect={o.updated_at}
                moves={moves[o.status] ?? []}
                undo={{ label: t("undo"), done: t("undone") }}
                small={false}
              />
            ) : null}
            {o.status === "pending_payment" ? (
              <>
                <InlineAction
                  action={resendLinkAction}
                  id={o.id}
                  label={t("actions.resend")}
                  done={t("actions.resent")}
                />
                <ManualPaymentDialog id={o.id} total={money(o.total.amount)} />
              </>
            ) : null}
            {o.status === "preparing" && !o.pickup ? (
              <Link className="btn sm" href={`/sales/shipping?q=${encodeURIComponent(o.number)}`}>
                {t("actions.shipments")}
              </Link>
            ) : null}
            {o.status === "shipping" ? (
              <ConfirmAction
                action={deliveredAction}
                id={o.id}
                label={t("actions.deliver")}
                title={t("actions.deliverTitle", { number: o.number })}
                points={[t("actions.deliverInvoice"), t("actions.deliverFinal")]}
                submit={t("actions.deliverSubmit")}
                done={t("actions.delivered")}
                danger={false}
              />
            ) : null}
            {o.status === "delivery_failed" ? (
              <ConfirmAction
                action={redeliverAction}
                id={o.id}
                label={t("actions.redeliver")}
                title={t("actions.redeliverTitle", { number: o.number })}
                points={[t("actions.redeliverShipment")]}
                submit={t("actions.redeliverSubmit")}
                done={t("actions.redelivered")}
                danger={false}
              />
            ) : null}
            {[
              "pending_payment",
              "awaiting_acceptance",
              "confirmed",
              "preparing",
              "delivery_failed",
            ].includes(o.status) ? (
              <ConfirmAction
                action={cancelOrderAction}
                id={o.id}
                label={t("actions.cancel")}
                title={t("actions.cancelTitle", { number: o.number })}
                points={[
                  remaining > 0
                    ? t("actions.cancelRefund", { amount: money(remaining), to: destination })
                    : t("actions.cancelNoMoney"),
                  t("actions.cancelStock"),
                  t("actions.cancelFinal"),
                ]}
                submit={t("actions.cancelSubmit")}
                done={t("actions.cancelled")}
              />
            ) : null}
            {refund && remaining > 0 ? (
              <RefundDialog
                id={o.id}
                number={o.number}
                buyer={o.buyer.name}
                remaining={remaining}
                destination={destination}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      <ol className="ord-steps" aria-label={t("detail.progress")}>
        {STEPS.map((step, i) => (
          <li
            key={step}
            data-done={o.status !== "cancelled" && i < reached ? "" : undefined}
            data-bad={o.status === "delivery_failed" && step === "shipping" ? "" : undefined}
            aria-current={i === reached - 1 ? "step" : undefined}
          >
            {step === "paid" && o.payment_method === "cod"
              ? t("steps.cod")
              : step === "shipping" && o.pickup
                ? t("steps.pickup")
                : t(`steps.${step}`)}
          </li>
        ))}
      </ol>
      {o.status === "cancelled" ? (
        <p className="ord-warn">
          {t("detail.cancelled", {
            reason: t(`cancelReasons.${o.cancel_reason ?? "staff_cancelled"}`),
          })}
        </p>
      ) : null}

      {proposal?.proposal ? (
        <section className="ord-proposal" aria-labelledby="proposal-h">
          <h3 id="proposal-h">
            {t("proposal.title", {
              agent: proposal.proposal.agent,
              amount: money(proposal.proposal.amount.amount),
            })}
          </h3>
          <p>
            {proposal.proposal.status === "rejected"
              ? t("proposal.rejectedText")
              : t("proposal.text", {
                  reason: t(`returns.reasons.${proposal.reason_code}`),
                  media: proposal.media.length,
                })}
          </p>
          {refund && proposal.proposal.status === "pending" ? (
            <div className="row-acts">
              <ApproveProposal
                returnId={proposal.id}
                amount={money(proposal.proposal.amount.amount)}
                order={o.number}
                body={t("proposal.confirmBody", { buyer: o.buyer.name, to: destination })}
                rows={[
                  [t("refund.order"), o.number],
                  [t("refund.buyer"), o.buyer.name],
                  [t("refund.amount"), money(proposal.proposal.amount.amount)],
                  [t("refund.to"), destination],
                  [
                    t("proposal.by"),
                    t("proposal.byText", {
                      agent: proposal.proposal.agent,
                      reason: t(`returns.reasons.${proposal.reason_code}`),
                    }),
                  ],
                  [t("refund.permission"), "orders.refund"],
                ]}
              />
              <ChangeButtons
                action={proposalAction}
                id={proposal.id}
                expect=""
                moves={[
                  { value: "reject", label: t("proposal.reject"), done: t("proposal.rejected") },
                ]}
                undo={{ label: t("undo"), done: t("undone") }}
              />
            </div>
          ) : refund && proposal.proposal.status === "rejected" ? (
            <ChangeButtons
              action={proposalAction}
              id={proposal.id}
              expect=""
              moves={[
                { value: "reopen", label: t("proposal.reopen"), done: t("proposal.reopened") },
              ]}
              undo={{ label: t("undo"), done: t("undone") }}
            />
          ) : null}
          <p className="fhint">{t("proposal.note")}</p>
        </section>
      ) : null}

      <div className="ord-grid">
        <div className="ord-col">
          <section className="card padded dlg-form" aria-labelledby="lines-h">
            <h2 id="lines-h" className="h2">
              {t("detail.lines")}
            </h2>
            <ul className="cat-lines">
              {o.lines.map((l) => (
                <li key={l.id}>
                  <span className="cell2">
                    <span>
                      {l.name}
                      {l.gift ? <span className="badge b-ok"> {t("detail.gift")}</span> : null}
                    </span>
                    <span className="sub">
                      <span className="mono">{l.sku}</span> ·{" "}
                      {t("detail.lineMeta", {
                        quantity: l.quantity,
                        unit: money(l.unit_price.amount),
                        rate: l.taxes[0] ? Number(l.taxes[0].rate) * 100 : 0,
                      })}
                      {l.discounts.map((d) => ` · ${d.title} −${money(d.amount.amount)}`).join("")}
                      {l.returned_quantity > 0
                        ? ` · ${t("detail.returnedQty", { n: l.returned_quantity })}`
                        : ""}
                    </span>
                  </span>
                  <b className="num">{money(l.net.amount)}</b>
                </li>
              ))}
            </ul>
            <p className="fhint">{t("detail.snapshot")}</p>
          </section>

          {o.promotions.length > 0 ? (
            <section className="card padded dlg-form" aria-labelledby="promos-h">
              <h2 id="promos-h" className="h2">
                {t("detail.promotions")}
              </h2>
              <ul className="cat-lines">
                {o.promotions.map((p) => (
                  <li key={p.promotion_id}>
                    <span className="cell2">
                      <Link href={`/marketing/promotions?open=${p.promotion_id}`}>{p.title}</Link>
                      <span className="sub">
                        {p.code ? t("detail.code", { code: p.code }) : t("detail.automatic")}
                      </span>
                    </span>
                    <b className="num">−{money(p.amount.amount)}</b>
                  </li>
                ))}
              </ul>
              <p className="fhint">{t("detail.promotionsNote")}</p>
            </section>
          ) : null}

          <section className="card padded dlg-form" aria-labelledby="ship-h">
            <h2 id="ship-h" className="h2">
              {t("detail.delivery")}
            </h2>
            {o.pickup ? (
              <p>
                {t("detail.pickup", {
                  store: o.pickup.org_name,
                  status: t(`pickupStatus.${o.pickup.status}`),
                })}{" "}
                <Link href="/sales/stores">{t("detail.openStores")}</Link>
              </p>
            ) : o.ship_to ? (
              <p>
                {t("detail.shipTo", {
                  line: o.ship_to.line,
                  commune: o.ship_to.commune,
                  province: o.ship_to.province,
                })}
              </p>
            ) : (
              <p>{t("detail.counter")}</p>
            )}
            {mine.length > 0 ? (
              <ul className="cat-lines">
                {mine.map((x) => (
                  <li key={x.id}>
                    <span className="cell2">
                      <Link
                        href={`/sales/shipping?q=${encodeURIComponent(o.number)}&open=${x.id}#shipments-h`}
                      >
                        {x.tracking_numbers.join(", ") || t("detail.noTracking")}
                      </Link>
                      <span className="sub">
                        {x.carrier_name ?? x.method_name} · {x.origin_name}
                      </span>
                    </span>
                    <span className="badge b-info">{ts(`status.${x.status}`)}</span>
                  </li>
                ))}
              </ul>
            ) : o.channel !== "pos" &&
              !o.pickup &&
              ["pending_payment", "awaiting_acceptance", "confirmed", "preparing"].includes(
                o.status,
              ) ? (
              <p className="fhint">{t("detail.noShipment")}</p>
            ) : null}
            <h3 className="pm-h">{t("detail.invoice")}</h3>
            <p>
              {o.invoice
                ? t(`detail.invoiceIssued.${o.invoice.kind}`, {
                    series: o.invoice.series,
                    number: o.invoice.number,
                  })
                : o.seller
                  ? t("detail.invoiceSeller")
                  : t("detail.invoicePending")}
            </p>
            {o.invoice?.kind === "cash_register" ? (
              <p>
                <Link className="btn sm" href={`/sales/orders/${o.id}/receipt`}>
                  {t("detail.printReceipt")}
                </Link>
              </p>
            ) : null}
          </section>

          {returns.length > 0 ? (
            <section className="card padded dlg-form" aria-labelledby="ret-h">
              <h2 id="ret-h" className="h2">
                {t("detail.returns")}
              </h2>
              <ul className="cat-lines">
                {returns.map((r) => (
                  <li key={r.id}>
                    <span className="cell2">
                      <Link className="mono" href={`/sales/orders/returns?open=${r.id}#returns-h`}>
                        {r.number}
                      </Link>
                      <span className="sub">
                        {t(`returns.reasons.${r.reason_code}`)} · {money(r.refund_amount.amount)}
                      </span>
                    </span>
                    <span className={RETURN_BADGE[r.status]}>{t(`returnStatus.${r.status}`)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card padded dlg-form" aria-labelledby="ledger-h">
            <h2 id="ledger-h" className="h2">
              {t("ledger.title")}
            </h2>
            <p className="fhint">{t("ledger.about")}</p>
            {ledger.length === 0 ? (
              <p className="empty">
                {o.payment_method === "cod" ? t("ledger.emptyCod") : t("ledger.empty")}
              </p>
            ) : (
              <Table cards>
                <thead>
                  <tr>
                    <Th>{t("ledger.entry")}</Th>
                    <Th>{t("ledger.side")}</Th>
                    <Th>{t("ledger.account")}</Th>
                    <Th className="text-right">{t("ledger.amount")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.flatMap((e) =>
                    e.lines.map((l, i) => (
                      <tr key={`${e.reference}-${l.account}-${l.side}-${l.detail}`}>
                        <Td className="rt-title">
                          {i === 0 ? (
                            <span className="cell2">
                              <span>{t(`ledger.kinds.${e.kind}`)}</span>
                              <span className="sub">
                                <Time value={e.at} />
                              </span>
                            </span>
                          ) : (
                            <span className="sub">↳</span>
                          )}
                        </Td>
                        <Td label={t("ledger.side")}>{t(`ledger.sides.${l.side}`)}</Td>
                        <Td label={t("ledger.account")}>
                          {t(`accounts.${l.account}`)}
                          {l.detail ? ` — ${l.detail}` : ""}
                        </Td>
                        <Td label={t("ledger.amount")} className="text-right num">
                          {money(l.amount.amount)}
                        </Td>
                      </tr>
                    )),
                  )}
                </tbody>
              </Table>
            )}
            <p className="fhint">
              {o.funds_flow === "partner_collect"
                ? t("ledger.partnerNote")
                : t("ledger.appendOnly")}
            </p>
          </section>
        </div>

        <div className="ord-col">
          <section className="card padded dlg-form" aria-labelledby="sum-h">
            <h2 id="sum-h" className="h2">
              {t("detail.totals")}
            </h2>
            <dl className="ord-sums">
              <dt>{t("detail.subtotal")}</dt>
              <dd>{money(o.subtotal.amount)}</dd>
              {Number(o.discount.amount) > 0 ? (
                <>
                  <dt>{t("detail.discount")}</dt>
                  <dd>−{money(o.discount.amount)}</dd>
                </>
              ) : null}
              <dt>{t("detail.shipping")}</dt>
              <dd>{money(o.shipping_fee.amount)}</dd>
              {Number(o.shipping_discount.amount) > 0 ? (
                <>
                  <dt>{t("detail.shippingDiscount")}</dt>
                  <dd>−{money(o.shipping_discount.amount)}</dd>
                </>
              ) : null}
              {[...vatByRate].map(([rate, amount]) => (
                <Vat
                  key={rate}
                  label={t("detail.vat", { rate: Number(rate) * 100 })}
                  value={money(amount)}
                />
              ))}
              <dt className="big">{t("detail.total")}</dt>
              <dd className="big">{money(o.total.amount)}</dd>
              <dt>{t("detail.paid")}</dt>
              <dd>{money(o.paid.amount)}</dd>
              {Number(o.refunded.amount) > 0 ? (
                <>
                  <dt>{t("detail.refunded")}</dt>
                  <dd>−{money(o.refunded.amount)}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="ord-flow" aria-labelledby="flow-h">
            <h3 id="flow-h">{t(`flowTitle.${o.flow}`)}</h3>
            <p>{t(`flowText.${o.flow}`, { store: o.org_name })}</p>
            {o.seller ? (
              <p className="fhint">
                {t("detail.sellerTax", { kind: t(`sellerKind.${o.seller.kind}`) })}
              </p>
            ) : null}
            <ul className="cat-lines">
              {o.payments.map((p) => (
                <li key={p.id}>
                  <span className="cell2">
                    <span>
                      {t(`method.${p.method}`)} · {p.partner}
                    </span>
                    <span className="sub">
                      {t(`paymentStatus.${p.status}`)}
                      {p.received && p.received.amount !== p.amount.amount
                        ? ` · ${t("detail.received", { amount: money(p.received.amount) })}`
                        : ""}
                      {o.payment_due_at && p.status === "pending" ? " · " : ""}
                      {o.payment_due_at && p.status === "pending" ? (
                        <Time value={o.payment_due_at} />
                      ) : null}
                    </span>
                  </span>
                  <b className="num">{money(p.amount.amount)}</b>
                </li>
              ))}
              {o.refunds.map((r) => (
                <li key={r.id}>
                  <span className="cell2">
                    <span>
                      {t("detail.refund", {
                        reason: t.has(`refundReasons.${r.reason}`)
                          ? t(`refundReasons.${r.reason}`)
                          : r.reason,
                      })}
                    </span>
                    <span className="sub">
                      {t(`refund.dest.${r.destination}`, { via })} · <Time value={r.created_at} />
                    </span>
                  </span>
                  <b className="num">−{money(r.amount.amount)}</b>
                </li>
              ))}
            </ul>
          </section>

          <section className="card padded dlg-form" aria-labelledby="act-h">
            <h2 id="act-h" className="h2">
              {t("activity.title")}
            </h2>
            {manage ? <NoteForm id={o.id} /> : null}
            <ol className="timeline">
              {activity.map((a) => (
                <li key={a.id}>
                  <span>
                    <b>{a.who}</b>{" "}
                    {a.note ? <span className="badge b-draft">{t("activity.note")}</span> : null}{" "}
                    {a.text}
                  </span>
                  <span className="sub">
                    <Time value={a.at} />
                  </span>
                </li>
              ))}
            </ol>
            <p className="fhint">{t("activity.audit")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Vat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
