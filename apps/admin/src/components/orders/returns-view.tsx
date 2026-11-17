import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  approveReturnAction,
  bulkApproveReturnsAction,
  bulkCloseReturnsAction,
  closeReturnAction,
  refundReturnAction,
} from "@/app/(admin)/sales/orders/actions";
import { RETURN_BADGE } from "@/components/orders/badges";
import { MoneyConfirm, ReceiveReturnDialog, RejectReturnDialog } from "@/components/orders/forms";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatCount, formatMoney } from "@/lib/format";
import { ORDERS_REFUND, ORDERS_RETURNS_MANAGE } from "@/lib/orders";
import { readPage, slicePage } from "@/lib/table";
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
 * hàng): lọc theo trạng thái, mở một dòng để xem lý do, ảnh / video mở hộp, hạn đổi trả, lịch sử. Dòng
 * hiện một nút cho bước kế tiếp, các bước còn lại trong "⋯"; chọn nhiều để duyệt hay đóng (lặp lệnh từng
 * cái, gom lỗi). Hoàn tiền chỉ từng yêu cầu, qua hộp xác nhận nêu số tiền và nơi tiền về. Phân trang có
 * tổng (nguồn mẫu có đủ danh sách).
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
  const [t, tt, locale] = await Promise.all([
    getTranslations("orders"),
    getTranslations("table"),
    getLocale(),
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = CHIPS.find((s) => s === one("status"));
  const open = one("open");
  const paging = readPage(params);
  const [list, counts, manage, refund] = await Promise.all([
    listReturns({ ...(status ? { status } : {}), ...(method ? { method } : {}) }),
    returnCounts(method),
    can(ORDERS_RETURNS_MANAGE),
    can(ORDERS_REFUND),
  ]);
  const page = slicePage(list.data, paging.page, paging.per);
  // Tham số giữ khi đổi trang: bộ lọc và số dòng mỗi trang.
  const keep = { status: status ?? null, per: params.per ? paging.per : null };
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = {
      status: status ?? "",
      page: page.page > 1 ? String(page.page) : "",
      per: keep.per ? String(keep.per) : "",
      ...change,
    };
    for (const [key, v] of Object.entries(merged)) if (v) next.set(key, v);
    const q = next.toString();
    return q ? `${base}?${q}` : base;
  };
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const bulk: BulkActionSpec[] = [
    {
      key: "approve",
      label: t("returns.approve"),
      tone: "pri",
      run: bulkApproveReturnsAction,
      confirm: {
        title: t("returns.bulkApproveTitle"),
        points: [t("returns.bulkApproveOnly"), t("returns.approveBuyer")],
        submit: t("returns.approveSubmit"),
      },
    },
    { key: "close", label: t("returns.close"), run: bulkCloseReturnsAction },
  ];
  // Các bước làm được trên một yêu cầu, theo thứ tự xử lý: bước đầu hiện trên dòng, còn lại vào "⋯"
  // (mọi bước đều mở hộp thoại, trừ "Đóng" — chỉ có khi không còn bước nào khác).
  const nextSteps = (r: OrderReturn): Step[] => {
    const out: Step[] = [];
    if (manage && r.status === "requested" && r.return_method !== "in_store") {
      out.push({
        label: t("returns.approve"),
        node: (
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
        ),
      });
    }
    if (
      manage &&
      (r.status === "approved" || (r.status === "requested" && r.return_method === "in_store"))
    ) {
      const inStore = r.return_method === "in_store";
      out.push({
        label: inStore ? t("returns.receiveInStore") : t("returns.receive"),
        node: <ReceiveReturnDialog id={r.id} number={r.number} inStore={inStore} />,
      });
    }
    if (manage && r.status === "requested") {
      out.push({
        label: t("returns.reject"),
        node: <RejectReturnDialog id={r.id} number={r.number} />,
      });
    }
    if (refund && r.status === "received" && r.resolution === "refund") {
      out.push({ label: t("returns.refund"), node: <RefundStep r={r} locale={locale} /> });
    }
    if (
      manage &&
      (r.status === "refunded" || (r.status === "received" && r.resolution === "exchange"))
    ) {
      out.push({
        label: t("returns.close"),
        node: (
          <InlineAction
            action={closeReturnAction}
            id={r.id}
            label={t("returns.close")}
            ariaLabel={`${t("returns.close")} ${r.number}`}
            done={t("returns.closed")}
          />
        ),
      });
    }
    return out;
  };
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
            href={href({ status: null, page: null })}
            aria-current={status ? undefined : "page"}
          >
            {t("returns.all")} <span className="cnt">{counts.all}</span>
          </Link>
          {CHIPS.map((s) => (
            <Link
              key={s}
              className={status === s ? "chip on" : "chip"}
              href={href({ status: s, page: null })}
              aria-current={status === s ? "page" : undefined}
            >
              {t(`returnStatus.${s}`)} <span className="cnt">{counts[s]}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("returns.empty")}</p>
          ) : (
            <BulkTable ids={page.data.map((r) => r.id)} actions={manage ? bulk : []}>
              <Table cards>
                <thead>
                  <tr>
                    {manage ? <SelectAllTh /> : null}
                    <Th>{t("returns.request")}</Th>
                    <Th>{t("returns.reason")}</Th>
                    <Th>{t("returns.method")}</Th>
                    <Th className="text-right">{t("returns.amount")}</Th>
                    <Th>{t("returns.due")}</Th>
                    <Th>{t("returns.state")}</Th>
                    <Th>
                      <span className="vh">{t("returns.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((r) => {
                    const isOpen = open === r.id;
                    const steps = nextSteps(r);
                    return [
                      <tr key={r.id} data-current={isOpen ? "" : undefined}>
                        {manage ? <SelectTd id={r.id} name={r.number} /> : null}
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
                        <Td className="rt-acts">
                          <span className="row-acts">
                            {steps[0]?.node ?? null}
                            <RowMenu
                              label={tt("moreFor", { name: r.number })}
                              items={[
                                {
                                  label: isOpen ? t("returns.hideDetail") : t("returns.openDetail"),
                                  href: isOpen ? href({}) : `${href({ open: r.id })}#returns-h`,
                                },
                                {
                                  label: t("returns.openOrder"),
                                  href: `/sales/orders/${r.order_id}`,
                                },
                                ...steps
                                  .slice(1)
                                  .map((step) => ({ label: step.label, dialog: step.node })),
                              ]}
                            />
                          </span>
                        </Td>
                      </tr>,
                      isOpen ? (
                        <tr key={`${r.id}-open`} className="cat-detail-row">
                          <td colSpan={manage ? 8 : 7}>
                            <Detail r={r} />
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={base} keep={keep} />
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

type Step = { label: string; node: ReactNode };

/** Nút hoàn tiền của một yêu cầu: hộp xác nhận nêu số tiền, người mua và nơi tiền về. */
async function RefundStep({ r, locale }: { r: OrderReturn; locale: string }) {
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
  return (
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
  );
}

async function Detail({ r }: { r: OrderReturn }) {
  const [t, locale] = await Promise.all([getTranslations("orders"), getLocale()]);
  const money = (amount: string) => formatMoney(amount, "VND", locale);
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
    </div>
  );
}
