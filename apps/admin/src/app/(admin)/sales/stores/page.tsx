import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkPickupReadyAction,
  bulkResendCodeAction,
  cancelPickupAction,
  pickupReadyAction,
  resendCodeAction,
  undoPickupReadyAction,
} from "@/app/(admin)/sales/stores/actions";
import { ChangeButtons } from "@/components/engage/actions";
import { PICKUP_BADGE } from "@/components/orders/badges";
import { HandoverDialog } from "@/components/orders/forms";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatMoney } from "@/lib/format";
import { ORDERS_MANAGE } from "@/lib/orders";
import { readPage, slicePage } from "@/lib/table";
import { can } from "@/lib/viewer";
import { ORG } from "@/sample/catalog";
import { listPickups, type Order, PICKUP_HOLD_DAYS, refundDestination } from "@/sample/orders";
import { vietnamDay } from "@/sample/tax";
import { STORE_TABS } from "../orders/shared";

const CHIPS = { q3: ORG.Q3, td: ORG.TD, cg: ORG.CG } as const;

// Tab "Nhận tại cửa hàng": đơn người mua chọn nhận ở cửa hàng. Soạn xong thì báo sẵn sàng (người mua
// nhận mã 6 số, giữ hàng 3 ngày); bàn giao khi người nhận đọc đúng mã, hoặc người nhận hộ khớp tên đã
// khai; quá hạn giữ thì huỷ, trả hàng về tồn và hoàn tiền. Nhân viên không bao giờ thấy mã nhận.
// Dòng hiện một nút cho bước kế tiếp (báo sẵn sàng / bàn giao), còn lại trong "⋯"; chọn nhiều để báo
// sẵn sàng hay gửi lại mã (lặp lệnh từng đơn, gom lỗi). Phân trang có tổng (nguồn mẫu có đủ danh sách).
export default async function PickupPage(props: PageProps<"/sales/stores">) {
  if (!(await can(STORE_TABS.pickup))) {
    for (const tab of ["shifts", "returns", "reviews"] as const) {
      if (await can(STORE_TABS[tab])) redirect(`/sales/stores/${tab}`);
    }
  }
  const [t, to, tt, locale, params, list, manage] = await Promise.all([
    getTranslations("stores"),
    getTranslations("orders"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
    listPickups(),
    can(ORDERS_MANAGE),
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const chip = one("chip");
  const open = one("open");
  const today = vietnamDay();
  const due = (o: Order) =>
    o.pickup?.status === "ready" &&
    o.pickup.hold_until !== null &&
    vietnamDay(Date.parse(o.pickup.hold_until)) <= today;
  const active = list.data.filter(
    (o) => o.pickup?.status === "preparing" || o.pickup?.status === "ready",
  );
  const keep = (o: Order) =>
    !chip ||
    (chip in CHIPS && o.org_id === CHIPS[chip as keyof typeof CHIPS]) ||
    (chip === "ready" && o.pickup?.status === "ready") ||
    (chip === "due" && due(o)) ||
    (chip === "done" && (o.pickup?.status === "handed" || o.pickup?.status === "expired_cancel"));
  const paging = readPage(params);
  const page = slicePage(
    (chip === "done" ? list.data : active).filter(keep),
    paging.page,
    paging.per,
  );
  const rows = page.data;
  const kept = { chip: chip || null, per: params.per ? paging.per : null };
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = {
      chip,
      page: page.page > 1 ? String(page.page) : "",
      per: kept.per ? String(kept.per) : "",
      ...change,
    };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const q = next.toString();
    return q ? `/sales/stores?${q}` : "/sales/stores";
  };
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const chips: [string, string, number][] = [
    ["", t("pickup.all"), active.length],
    ["q3", "CN Quận 3", active.filter((o) => o.org_id === ORG.Q3).length],
    ["td", "CN Thủ Đức", active.filter((o) => o.org_id === ORG.TD).length],
    ["cg", "CN Cầu Giấy", active.filter((o) => o.org_id === ORG.CG).length],
    ["ready", t("pickup.ready"), active.filter((o) => o.pickup?.status === "ready").length],
    ["due", t("pickup.due"), active.filter(due).length],
    ["done", t("pickup.done"), list.data.length - active.length],
  ];
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="pickup-h">
        <div className="block-head">
          <h2 id="pickup-h" className="h2">
            {t("pickup.title")}
          </h2>
        </div>
        <p className="fhint">{t("pickup.about", { days: PICKUP_HOLD_DAYS })}</p>
        <nav className="chips" aria-label={t("pickup.filter")}>
          {chips.map(([key, label, n]) => (
            <Link
              key={key || "all"}
              className={chip === key ? "chip on" : "chip"}
              href={href({ chip: key || null, open: null, page: null })}
              aria-current={chip === key ? "page" : undefined}
            >
              {label} <span className="cnt">{n}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {rows.length === 0 ? (
            <p className="empty">{t("pickup.empty")}</p>
          ) : (
            <BulkTable
              ids={rows.map((o) => o.id)}
              actions={
                manage
                  ? [
                      {
                        key: "ready",
                        label: t("pickup.markReady"),
                        tone: "pri",
                        run: bulkPickupReadyAction,
                        undo: undoPickupReadyAction,
                      },
                      {
                        key: "resend",
                        label: t("pickup.resend"),
                        run: bulkResendCodeAction,
                        confirm: {
                          title: t("pickup.bulkResendTitle"),
                          points: [t("pickup.resendOld")],
                          submit: t("pickup.resend"),
                        },
                      },
                    ]
                  : []
              }
            >
              <Table cards>
                <thead>
                  <tr>
                    {manage ? <SelectAllTh /> : null}
                    <Th>{t("pickup.order")}</Th>
                    <Th>{t("pickup.store")}</Th>
                    <Th>{t("pickup.times")}</Th>
                    <Th className="text-right">{t("pickup.money")}</Th>
                    <Th>{t("pickup.state")}</Th>
                    <Th>
                      <span className="vh">{t("pickup.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const p = o.pickup;
                    if (!p) return null;
                    const isOpen = open === o.id;
                    const menu: RowMenuItem[] = [
                      {
                        label: isOpen ? t("pickup.hideDetail") : t("pickup.openDetail"),
                        href: isOpen ? href({ open: null }) : `${href({ open: o.id })}#pickup-h`,
                      },
                      { label: t("pickup.openOrder"), href: `/sales/orders/${o.id}` },
                    ];
                    if (manage && p.status === "ready") {
                      menu.push(
                        {
                          label: t("pickup.resend"),
                          dialog: (
                            <ConfirmAction
                              action={resendCodeAction}
                              id={o.id}
                              label={t("pickup.resend")}
                              title={t("pickup.resendTitle", { number: o.number })}
                              points={[t("pickup.resendOld")]}
                              submit={t("pickup.resend")}
                              done={t("pickup.resent")}
                              danger={false}
                            />
                          ),
                        },
                        {
                          label: t("pickup.cancel"),
                          danger: true,
                          dialog: (
                            <ConfirmAction
                              action={cancelPickupAction}
                              id={o.id}
                              label={t("pickup.cancel")}
                              title={t("pickup.cancelTitle", { number: o.number })}
                              points={[
                                t("pickup.cancelStock", { store: p.org_name }),
                                t("pickup.cancelRefund", {
                                  amount: money(o.total.amount),
                                  to: to(`refund.dest.${refundDestination(o.payment_method)}`, {
                                    via: to(`refund.via.${o.payment_method}`),
                                  }),
                                }),
                                t("pickup.cancelFinal"),
                              ]}
                              submit={t("pickup.cancelSubmit")}
                              done={t("pickup.cancelled")}
                            />
                          ),
                        },
                      );
                    }
                    return [
                      <tr key={o.id} data-current={isOpen ? "" : undefined}>
                        {manage ? <SelectTd id={o.id} name={o.number} /> : null}
                        <Td className="rt-title">
                          <span className="cell2">
                            <Link
                              className="open mono"
                              href={
                                isOpen ? href({ open: null }) : `${href({ open: o.id })}#pickup-h`
                              }
                              scroll={false}
                              aria-expanded={isOpen}
                            >
                              {o.number}
                            </Link>
                            <span className="sub">{o.buyer.name}</span>
                          </span>
                        </Td>
                        <Td label={t("pickup.store")}>{p.org_name}</Td>
                        <Td label={t("pickup.times")}>
                          <span className="cell2">
                            <span>
                              {p.ready_at ? t("pickup.readyAt") : t("pickup.placedAt")}{" "}
                              <Time value={p.ready_at ?? o.placed_at} />
                            </span>
                            {p.hold_until ? (
                              <span className={due(o) ? "sub cat-neg" : "sub"}>
                                {t("pickup.holdUntil")} <Time value={p.hold_until} />
                              </span>
                            ) : null}
                          </span>
                        </Td>
                        <Td label={t("pickup.money")} className="text-right num">
                          <span className="cell2">
                            <span>{money(o.total.amount)}</span>
                            <span className="sub">{to(`method.${o.payment_method}`)}</span>
                          </span>
                        </Td>
                        <Td label={t("pickup.state")}>
                          <span className={PICKUP_BADGE[p.status]}>
                            <span className="dot" />
                            {to(`pickupStatus.${p.status}`)}
                          </span>
                        </Td>
                        <Td className="rt-acts">
                          <span className="row-acts">
                            {manage && p.status === "preparing" ? (
                              <ChangeButtons
                                action={pickupReadyAction}
                                id={o.id}
                                expect=""
                                moves={[
                                  {
                                    value: "ready",
                                    label: t("pickup.markReady"),
                                    done: t("pickup.markedReady", {
                                      number: o.number,
                                      days: PICKUP_HOLD_DAYS,
                                    }),
                                    tone: "pri",
                                  },
                                ]}
                                undo={{ label: to("undo"), done: to("undone") }}
                              />
                            ) : null}
                            {manage && p.status === "ready" ? (
                              <HandoverDialog
                                id={o.id}
                                number={o.number}
                                proxy={p.proxy?.name ?? null}
                              />
                            ) : null}
                            <RowMenu label={tt("moreFor", { name: o.number })} items={menu} />
                          </span>
                        </Td>
                      </tr>,
                      isOpen ? (
                        <tr key={`${o.id}-open`} className="cat-detail-row">
                          <td colSpan={manage ? 7 : 6}>
                            <div className="cat-detail">
                              <h3 className="h2">
                                {t("pickup.detailTitle", { number: o.number, store: p.org_name })}
                              </h3>
                              <dl className="cat-kv">
                                <dt>{t("pickup.items")}</dt>
                                <dd>
                                  {o.lines.map((l) => `${l.name} × ${l.quantity}`).join(", ")}
                                </dd>
                                <dt>{t("pickup.payment")}</dt>
                                <dd>
                                  {to(`method.${o.payment_method}`)} · {money(o.total.amount)}
                                </dd>
                                {p.proxy ? (
                                  <>
                                    <dt>{t("pickup.proxy")}</dt>
                                    <dd>{t("pickup.proxyValue", { name: p.proxy.name })}</dd>
                                  </>
                                ) : null}
                              </dl>
                              <p className="fhint">
                                {due(o)
                                  ? t("pickup.dueNote", {
                                      method: to(`method.${o.payment_method}`),
                                    })
                                  : t("pickup.codeNote")}
                              </p>
                            </div>
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
          total={page.total}
          page={page.page}
          per={paging.per}
          base="/sales/stores"
          keep={kept}
        />
      </section>
    </div>
  );
}
