import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  bookAction,
  bulkBookAction,
  bulkTrackAction,
  cancelShipmentAction,
  handOverAction,
  receiveReturnAction,
  redeliverAction,
  returnAction,
  trackAction,
} from "@/app/(admin)/sales/shipping/actions";
import { SHIPMENT_BADGE } from "@/components/shipping/badges";
import { SplitDialog } from "@/components/shipping/forms";
import { AutoFilter } from "@/components/ui/auto-filter";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCount, formatMoney } from "@/lib/format";
import { vnDateTime } from "@/lib/promotions";
import { formatWeight, maskPhone, SHIPPING_SHIPMENTS_MANAGE } from "@/lib/shipping";
import { can } from "@/lib/viewer";
import {
  getShipment,
  listShipments,
  type ShipmentRow,
  type ShipmentStatus,
  shipmentCounts,
} from "@/sample/shipping";
import { TAB_PERMISSIONS } from "./shared";

const FILTERS: ShipmentStatus[] = [
  "pending",
  "ready_to_ship",
  "in_transit",
  "out_for_delivery",
  "delivery_failed",
  "returning",
  "ready_for_pickup",
  "delivered",
];

const MOVING: ShipmentStatus[] = ["picked_up", "in_transit", "out_for_delivery"];

// Tab "Vận đơn": đơn cần giao tạo vận đơn ở trạng thái chờ đặt hãng; nhân viên kiểm hàng rồi đặt
// hãng; trạng thái sau đó do hãng báo về. Một đơn có thể có nhiều kiện hoặc nhiều vận đơn khi giao một
// phần. Mở một dòng để xem kiện, món, lịch sử. Dòng hiện một nút cho bước kế tiếp, còn lại trong "⋯";
// chọn nhiều để đặt hãng hay hỏi lại hành trình (lặp lệnh từng vận đơn, gom lỗi). Chưa có hàm in nhãn
// vận đơn (bước 44 của core chưa có endpoint nhãn) nên không có nút in. Phân trang theo con trỏ.
export default async function ShipmentsPage(props: PageProps<"/sales/shipping">) {
  if (!(await can(TAB_PERMISSIONS.shipments))) {
    // Người chỉ có quyền một tab khác (vd đối soát COD) vào thẳng tab đó.
    const order = ["rates", "calendar", "cod", "carriers"] as const;
    for (const tab of order) {
      if (await can(TAB_PERMISSIONS[tab])) redirect(`/sales/shipping/${tab}`);
    }
  }
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("shipping"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = FILTERS.find((s) => s === one("status"));
  const q = one("q").slice(0, 40);
  const open = one("open");
  const cursor = one("cursor");
  const [page, counts, detail, manage] = await Promise.all([
    listShipments({ ...(status ? { status } : {}), q, locale, cursor: cursor || null }),
    shipmentCounts(),
    open ? getShipment(open, locale) : Promise.resolve(null),
    can(SHIPPING_SHIPMENTS_MANAGE),
  ]);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: status ?? "", q, cursor, ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/sales/shipping?${query}` : "/sales/shipping";
  };
  const n = (s: ShipmentStatus) => counts[s] ?? 0;
  const steps = (x: ShipmentRow) => (manage ? shipmentSteps(x, t) : []);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="blocks">
      <section className="block" aria-label={t("shipments.kpis")}>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("status.pending")}</span>
            <b className="kpi-value">{formatCount(n("pending"), locale)}</b>
            <span className="kpi-sub">{t("shipments.kpiPendingSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("shipments.kpiMoving")}</span>
            <b className="kpi-value">
              {formatCount(
                MOVING.reduce((sum, s) => sum + n(s), 0),
                locale,
              )}
            </b>
            <span className="kpi-sub">{t("shipments.kpiMovingSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("status.delivery_failed")}</span>
            <b className="kpi-value">{formatCount(n("delivery_failed"), locale)}</b>
            <span className="kpi-sub">{t("shipments.kpiFailedSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("status.returning")}</span>
            <b className="kpi-value">{formatCount(n("returning"), locale)}</b>
            <span className="kpi-sub">{t("shipments.kpiReturningSub")}</span>
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="shipments-h">
        <div className="block-head">
          <h2 id="shipments-h" className="h2">
            {t("shipments.title")}
          </h2>
        </div>
        <p className="fhint">{t("shipments.about")}</p>
        <nav className="chips" aria-label={t("shipments.byStatus")}>
          <Link
            className={status ? "chip" : "chip on"}
            href={href({ status: null, open: null, cursor: null })}
            aria-current={status ? undefined : "page"}
          >
            {t("shipments.all")} <span className="cnt">{total}</span>
          </Link>
          {FILTERS.map((s) => (
            <Link
              key={s}
              className={status === s ? "chip on" : "chip"}
              href={href({ status: s, open: null, cursor: null })}
              aria-current={status === s ? "page" : undefined}
            >
              {t(`status.${s}`)} <span className="cnt">{n(s)}</span>
            </Link>
          ))}
        </nav>
        <search aria-label={t("shipments.search")}>
          <form className="filters" action="/sales/shipping">
            <AutoFilter />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <div className="fld grow">
              <label className="lab" htmlFor="ship-q">
                {t("shipments.search")}
              </label>
              <input
                id="ship-q"
                className="inp mono"
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("shipments.searchHint")}
                maxLength={40}
              />
            </div>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("shipments.filter")}
              </button>
            </div>
          </form>
        </search>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("shipments.empty")}</p>
          ) : (
            <BulkTable
              ids={page.data.map((x) => x.id)}
              actions={
                manage
                  ? [
                      {
                        key: "book",
                        label: t("actions.book"),
                        tone: "pri",
                        run: bulkBookAction,
                        confirm: {
                          title: t("actions.bulkBookTitle"),
                          points: [t("actions.bulkBookOnly"), t("actions.bookFee")],
                          submit: t("actions.bookSubmit"),
                        },
                      },
                      { key: "track", label: t("actions.track"), run: bulkTrackAction },
                    ]
                  : []
              }
            >
              <Table cards>
                <thead>
                  <tr>
                    {manage ? <SelectAllTh /> : null}
                    <Th>{t("shipments.order")}</Th>
                    <Th>{t("shipments.carrier")}</Th>
                    <Th>{t("shipments.route")}</Th>
                    <Th>{t("shipments.eta")}</Th>
                    <Th className="text-right">{t("shipments.cod")}</Th>
                    <Th>{t("shipments.state")}</Th>
                    <Th>
                      <span className="vh">{t("rates.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((x) => {
                    const isOpen = open === x.id && detail !== null;
                    const own = steps(x);
                    return [
                      <tr key={x.id} data-current={isOpen ? "" : undefined}>
                        {manage ? <SelectTd id={x.id} name={x.order_number} /> : null}
                        <Td className="rt-title">
                          <span className="cell2">
                            <Link
                              className="open mono"
                              href={
                                isOpen
                                  ? href({ open: null })
                                  : `${href({ open: x.id })}#shipments-h`
                              }
                              scroll={false}
                              aria-expanded={isOpen}
                            >
                              {x.order_number}
                            </Link>
                            <span className={x.tracking_numbers.length ? "sub mono" : "sub"}>
                              {x.tracking_numbers.join(", ") ||
                                (x.carrier_code
                                  ? t("shipments.noTracking")
                                  : t("shipments.noCarrier"))}
                            </span>
                          </span>
                        </Td>
                        <Td label={t("shipments.carrier")}>
                          <span className="cell2">
                            <span>{x.carrier_name ?? x.method_name}</span>
                            <span className="sub">
                              {x.carrier_name ? x.method_name : x.origin_name}
                            </span>
                          </span>
                        </Td>
                        <Td label={t("shipments.route")}>
                          <span className="cell2">
                            <span>{x.origin_name}</span>
                            <span className="sub">
                              → {x.address.commune_name}, {x.address.province_name}
                            </span>
                          </span>
                        </Td>
                        <Td label={t("shipments.eta")}>
                          <EtaRange from={x.eta_from} to={x.eta_to} locale={locale} />
                        </Td>
                        <Td label={t("shipments.cod")} className="text-right num">
                          {x.cod ? formatMoney(x.cod.amount, x.cod.currency, locale) : "—"}
                        </Td>
                        <Td label={t("shipments.state")}>
                          <span className={SHIPMENT_BADGE[x.status]}>
                            <span className="dot" />
                            {t(`status.${x.status}`)}
                          </span>
                        </Td>
                        <Td className="rt-acts">
                          <span className="row-acts">
                            {own[0]?.node ?? null}
                            <RowMenu
                              label={tt("moreFor", { name: x.order_number })}
                              items={[
                                {
                                  label: isOpen
                                    ? t("shipments.hideDetail")
                                    : t("shipments.openDetail"),
                                  href: isOpen
                                    ? href({ open: null })
                                    : `${href({ open: x.id })}#shipments-h`,
                                },
                                ...own.slice(1).map((step) => ({
                                  label: step.label,
                                  dialog: step.node,
                                  ...(step.danger ? { danger: true } : {}),
                                })),
                              ]}
                            />
                          </span>
                        </Td>
                      </tr>,
                      isOpen && detail ? (
                        <tr key={`${x.id}-open`} className="cat-detail-row">
                          <td colSpan={manage ? 8 : 7}>
                            <Detail x={detail.data} locale={locale} />
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
        <Pager
          first={cursor ? href({ cursor: null, open: null }) : null}
          next={
            page.pagination.next_cursor
              ? href({ cursor: page.pagination.next_cursor, open: null })
              : null
          }
        />
      </section>
    </div>
  );
}

/** Ngày giao dự kiến dạng khoảng (D-201): ngày theo giờ Việt Nam, thứ viết tắt theo ngôn ngữ. */
async function EtaRange({
  from,
  to,
  locale,
}: {
  from: string | null;
  to: string | null;
  locale: string;
}) {
  const t = await getTranslations("shipping.shipments");
  if (!from || !to) return <span>—</span>;
  const day = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${d}T00:00:00Z`));
  return <span>{from === to ? day(from) : t("etaRange", { from: day(from), to: day(to) })}</span>;
}

async function Detail({ x, locale }: { x: ShipmentRow; locale: string }) {
  const t = await getTranslations("shipping");
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const fields: [string, string][] = [
    [
      t("detail.carrier"),
      x.carrier_name
        ? `${x.carrier_name} · ${x.method_name}`
        : `${x.method_name} · ${x.origin_name}`,
    ],
    [
      t("detail.route"),
      `${x.origin_name} → ${x.address.line ? `${x.address.line}, ` : ""}${x.address.commune_name}, ${x.address.province_name}`,
    ],
    [t("detail.recipient"), `${x.recipient_name} · ${maskPhone(x.recipient_phone)}`],
    [
      t("detail.cod"),
      x.cod ? `${money(x.cod.amount)} · ${t(`codStatus.${x.cod_status}`)}` : t("detail.noCod"),
    ],
    [
      t("detail.weight"),
      t(
        x.volumetric_grams > x.parcels.reduce((s, p) => s + p.weight_grams, 0)
          ? "detail.weightVolumetric"
          : "detail.weightActual",
        {
          weight: formatWeight(x.chargeable_weight_grams, locale),
        },
      ),
    ],
    [t("detail.fee"), x.quoted_fee ? money(x.quoted_fee.amount) : "—"],
  ];
  if (x.attempts > 0)
    fields.push([
      t("detail.attempts"),
      t("detail.attemptsOf", { n: x.attempts, max: x.max_attempts }),
    ]);
  if (x.request_key !== "main") fields.push([t("detail.part"), x.request_key]);
  const last = x.events.at(-1);
  if (last && last.source === "carrier")
    fields.push([
      t("detail.carrierSays"),
      t.has(`carrierStatus.${last.carrier_status}`)
        ? t(`carrierStatus.${last.carrier_status}`)
        : last.carrier_status,
    ]);
  return (
    <div className="cat-detail">
      <h3 className="h2">{t("detail.title", { order: x.order_number })}</h3>
      <dl className="cat-kv">
        {fields.map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
      </dl>
      <h4 className="pm-h">{t("detail.parcels")}</h4>
      <ul className="cat-lines">
        {x.parcels.map((p, i) => {
          const items = x.items.filter((it) => it.parcel_id === p.id);
          return (
            <li key={p.id}>
              <span>
                {t("detail.parcel", { n: i + 1, weight: formatWeight(p.weight_grams, locale) })}
                {p.length_mm && p.width_mm && p.height_mm
                  ? ` · ${p.length_mm / 10}×${p.width_mm / 10}×${p.height_mm / 10} cm`
                  : ""}
                {p.tracking_number ? <span className="mono"> · {p.tracking_number}</span> : null}
              </span>
              <b>
                {items.length > 0
                  ? items.map((it) => `${it.name} × ${it.quantity}`).join(", ")
                  : t("detail.items", { count: x.items.reduce((s, it) => s + it.quantity, 0) })}
              </b>
            </li>
          );
        })}
      </ul>
      {x.events.length > 0 ? (
        <>
          <h4 className="pm-h">{t("detail.history")}</h4>
          <ol className="timeline">
            {[...x.events].reverse().map((e) => (
              <li key={e.id}>
                <span>
                  {t(`status.${e.status}`)}
                  {t.has(`carrierStatus.${e.carrier_status}`)
                    ? ` · ${t(`carrierStatus.${e.carrier_status}`)}`
                    : ""}
                </span>
                <span className="sub">
                  {vnDateTime(e.occurred_at, locale)} · {t(`sources.${e.source}`)}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {t.has(`notes.${x.status}`) ? <p className="fhint">{t(`notes.${x.status}`)}</p> : null}
    </div>
  );
}

type Translate = Awaited<ReturnType<typeof getTranslations<"shipping">>>;

/**
 * Các bước làm được trên một vận đơn, theo thứ tự xử lý: bước đầu hiện trên dòng, còn lại vào "⋯".
 * Mọi bước mở hộp xác nhận, trừ "Hỏi lại hành trình" (luôn đứng một mình, nên luôn là nút trên dòng).
 */
function shipmentSteps(
  x: ShipmentRow,
  t: Translate,
): { label: string; node: ReactNode; danger?: boolean }[] {
  const out: { label: string; node: ReactNode; danger?: boolean }[] = [];
  if (x.status === "pending" && x.carrier_code) {
    out.push({
      label: t("actions.book"),
      node: (
        <ConfirmAction
          action={bookAction}
          id={x.id}
          label={t("actions.book")}
          title={t("actions.bookTitle", { order: x.order_number })}
          points={[
            t("actions.bookCarrier", { carrier: x.carrier_name ?? "" }),
            t("actions.bookFee"),
            t("actions.bookCancel"),
          ]}
          submit={t("actions.bookSubmit")}
          done={t("actions.booked")}
          danger={false}
        />
      ),
    });
  }
  if (x.status === "pending") {
    out.push({ label: t("split.button"), node: <SplitDialog id={x.id} order={x.order_number} /> });
  }
  if (MOVING.includes(x.status)) {
    out.push({
      label: t("actions.track"),
      node: (
        <InlineAction
          action={trackAction}
          id={x.id}
          label={t("actions.track")}
          ariaLabel={`${t("actions.track")} ${x.order_number}`}
          done={t("actions.tracked")}
        />
      ),
    });
  }
  if (x.status === "delivery_failed") {
    out.push({
      label: t("actions.redeliver"),
      node: (
        <ConfirmAction
          action={redeliverAction}
          id={x.id}
          label={t("actions.redeliver")}
          title={t("actions.redeliverTitle", { order: x.order_number })}
          points={[
            t("actions.redeliverCarrier"),
            t("actions.redeliverAttempts", { n: x.attempts, max: x.max_attempts }),
          ]}
          submit={t("actions.redeliverSubmit")}
          done={t("actions.redelivered")}
          danger={false}
        />
      ),
    });
    out.push({
      label: t("actions.return"),
      danger: true,
      node: (
        <ConfirmAction
          action={returnAction}
          id={x.id}
          label={t("actions.return")}
          title={t("actions.returnTitle", { order: x.order_number })}
          points={[t("actions.returnCarrier"), t("actions.returnOrder"), t("actions.returnFee")]}
          submit={t("actions.returnSubmit")}
          done={t("actions.returned")}
        />
      ),
    });
  }
  if (x.status === "returning") {
    out.push({
      label: t("actions.receive"),
      node: (
        <ConfirmAction
          action={receiveReturnAction}
          id={x.id}
          label={t("actions.receive")}
          title={t("actions.receiveTitle", { order: x.order_number })}
          points={[t("actions.receiveStock", { origin: x.origin_name }), t("actions.receiveOrder")]}
          submit={t("actions.receiveSubmit")}
          done={t("actions.received")}
          danger={false}
        />
      ),
    });
  }
  if (x.status === "ready_for_pickup") {
    out.push({
      label: t("actions.handOver"),
      node: (
        <ConfirmAction
          action={handOverAction}
          id={x.id}
          label={t("actions.handOver")}
          title={t("actions.handOverTitle", { order: x.order_number })}
          points={[t("actions.handOverCode"), t("actions.handOverFinal")]}
          submit={t("actions.handOverSubmit")}
          done={t("actions.handedOver")}
          danger={false}
        />
      ),
    });
  }
  if (["pending", "booking", "ready_to_ship", "ready_for_pickup"].includes(x.status)) {
    out.push({
      label: t("actions.cancel"),
      danger: true,
      node: (
        <ConfirmAction
          action={cancelShipmentAction}
          id={x.id}
          label={t("actions.cancel")}
          title={t("actions.cancelTitle", { order: x.order_number })}
          points={[
            x.status === "ready_to_ship" ? t("actions.cancelCarrier") : t("actions.cancelLocal"),
            t("actions.cancelOrder"),
          ]}
          submit={t("actions.cancelSubmit")}
          done={t("actions.cancelled")}
        />
      ),
    });
  }
  return out;
}
