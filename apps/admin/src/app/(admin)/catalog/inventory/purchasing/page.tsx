import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkCancelPurchasesAction,
  bulkClosePurchasesAction,
  bulkPlacePurchasesAction,
  cancelPurchaseAction,
  closePurchaseAction,
  orderPurchaseAction,
  receivePurchaseAction,
} from "@/app/(admin)/catalog/inventory/actions";
import { LEDGER_BADGE, PURCHASE_BADGE } from "@/components/catalog/badges";
import { PurchaseDialog, ReceiptDialog, SupplierReturnDialog } from "@/components/inventory/forms";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import {
  formatDay,
  INVENTORY_PURCHASING_MANAGE,
  INVENTORY_PURCHASING_READ,
  INVENTORY_RECEIVE,
} from "@/lib/catalog";
import { formatCount, formatMoney } from "@/lib/format";
import { readPage, readSort, slicePage, withQuery } from "@/lib/table";
import { can } from "@/lib/viewer";
import { allVariants } from "@/sample/catalog";
import {
  listPurchaseOrders,
  listReceipts,
  listSupplierReturns,
  PURCHASE_SORTS,
  type PurchaseRow,
  purchasingStats,
} from "@/sample/inventory";
import { commerceGate } from "../../gate";
import { inventoryOptions } from "../options";

const BASE = "/catalog/inventory/purchasing";

// Tab "Nhập hàng": đơn đặt mua (nháp → đã đặt → nhận một phần → đã nhận đủ → đã đóng), phiếu nhập
// (cộng tồn, tính lại giá vốn bình quân, xếp job ghi sổ cái: Nợ hàng tồn kho / Có phải trả nhà cung
// cấp) và trả hàng nhà cung cấp (đảo bút toán). Bảng đơn đặt mua theo bộ bảng chuẩn (W-058): dòng hiện
// một nút phụ (bước kế tiếp: đặt hàng / nhận đủ / đóng), còn lại trong "⋯"; chọn nhiều để gửi đơn
// (đặt hàng), đóng hay huỷ (lặp lệnh từng đơn, gom lỗi); sắp theo số đơn, tổng tiền; phân trang có tổng.
export default async function PurchasingPage(props: PageProps<"/catalog/inventory/purchasing">) {
  const gate = await commerceGate(INVENTORY_PURCHASING_READ);
  if (gate) return gate;
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const open = typeof params.open === "string" ? params.open : "";
  const sorted = typeof params.sort === "string" && params.sort !== "";
  const sort = readSort(params, PURCHASE_SORTS, { field: "created", dir: "desc" });
  const paging = readPage(params);
  const [
    { data: stats },
    { data: listed },
    { data: receipts },
    { data: returns },
    { data: variants },
    options,
    manage,
    receive,
  ] = await Promise.all([
    purchasingStats(),
    listPurchaseOrders(sorted ? sort : null),
    listReceipts(),
    listSupplierReturns(),
    allVariants(locale),
    inventoryOptions(),
    can(INVENTORY_PURCHASING_MANAGE),
    can(INVENTORY_RECEIVE),
  ]);
  const page = slicePage(listed, paging.page, paging.per);
  const orders = page.data;
  const keep = sorted ? { sort: sort.field, dir: sort.dir } : {};
  const href = (change: Record<string, string | null>) =>
    withQuery(
      BASE,
      {
        ...keep,
        ...(page.page > 1 ? { page: page.page } : {}),
        ...(paging.per !== 25 ? { per: paging.per } : {}),
      },
      change,
    );
  const money = (m: { amount: string; currency: string }) =>
    formatMoney(m.amount, m.currency, locale);
  const name = (id: string) => {
    const v = variants.find((x) => x.variant_id === id);
    return v ? `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}` : id;
  };
  const close = (o: PurchaseRow) => (
    <ConfirmAction
      action={closePurchaseAction}
      id={o.id}
      label={t("purchasing.close")}
      title={t("purchasing.closeTitle", { number: o.number })}
      points={[t("purchasing.closePoint")]}
      submit={t("purchasing.closeSubmit")}
      done={t("purchasing.closed")}
      danger={false}
    />
  );
  // Nút phụ hiện trên dòng: bước kế tiếp của đơn (tối đa một nút, theo quy ước của W-058).
  const primary = (o: PurchaseRow) =>
    manage && o.status === "draft" ? (
      <InlineAction
        action={orderPurchaseAction}
        id={o.id}
        label={t("purchasing.place")}
        ariaLabel={`${t("purchasing.place")} ${o.number}`}
        done={t("purchasing.placed")}
      />
    ) : receive && (o.status === "ordered" || o.status === "partially_received") ? (
      <InlineAction
        action={receivePurchaseAction}
        id={o.id}
        label={t("purchasing.receiveAll")}
        ariaLabel={`${t("purchasing.receiveAll")} ${o.number}`}
        done={t("purchasing.receivedAll")}
      />
    ) : manage && o.status === "received" ? (
      close(o)
    ) : null;
  const menu = (o: PurchaseRow, isOpen: boolean): RowMenuItem[] => [
    {
      label: isOpen ? t("purchasing.hide") : t("purchasing.view"),
      href: isOpen ? href({ open: null }) : `${href({ open: o.id })}#po-h`,
    },
    ...(manage && o.status === "partially_received"
      ? [{ label: t("purchasing.close"), dialog: close(o) }]
      : []),
    ...(manage && (o.status === "draft" || o.status === "ordered")
      ? [
          {
            label: t("purchasing.cancel"),
            danger: true,
            dialog: (
              <ConfirmAction
                action={cancelPurchaseAction}
                id={o.id}
                label={t("purchasing.cancel")}
                title={t("purchasing.cancelTitle", { number: o.number })}
                points={[t("purchasing.cancelPoint")]}
                submit={t("purchasing.cancelSubmit")}
                done={t("purchasing.cancelled")}
              />
            ),
          },
        ]
      : []),
  ];
  const actions: BulkActionSpec[] = manage
    ? [
        {
          key: "place",
          label: t("purchasing.place"),
          tone: "pri",
          run: bulkPlacePurchasesAction,
          confirm: {
            title: t("purchasing.bulkPlaceTitle"),
            points: [t("purchasing.bulkPlacePoint"), t("purchasing.bulkDraftOnly")],
            submit: t("purchasing.place"),
          },
        },
        { key: "close", label: t("purchasing.close"), run: bulkClosePurchasesAction },
        {
          key: "cancel",
          label: t("purchasing.cancel"),
          tone: "danger",
          run: bulkCancelPurchasesAction,
          confirm: {
            title: t("purchasing.bulkCancelTitle"),
            points: [t("purchasing.cancelPoint")],
            submit: t("purchasing.cancelSubmit"),
          },
        },
      ]
    : [];
  return (
    <div className="blocks">
      <section className="block" aria-label={t("purchasing.kpis")}>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("purchasing.kpiPayable")}</span>
            <b className="kpi-value">{money(stats.payable)}</b>
            <span className="kpi-sub">
              {t("purchasing.kpiPayableSub", { queued: money(stats.queued) })}
            </span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("purchasing.kpiOpen")}</span>
            <b className="kpi-value">{formatCount(stats.open_orders.length, locale)}</b>
            <span className="kpi-sub mono">{stats.open_orders.join(", ") || "—"}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("purchasing.kpiMonth")}</span>
            <b className="kpi-value">{money(stats.received_month)}</b>
            <span className="kpi-sub">
              {t("purchasing.kpiMonthSub", { count: stats.receipts_month })}
            </span>
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="po-h">
        <div className="block-head">
          <h2 id="po-h" className="h2">
            {t("purchasing.ordersTitle")}
          </h2>
          {manage ? (
            <PurchaseDialog suppliers={options.suppliers} warehouses={options.warehouses} />
          ) : null}
        </div>
        <p className="fhint">{t("purchasing.ordersAbout")}</p>
        <div className="card tcard">
          <BulkTable ids={orders.map((o) => o.id)} actions={actions}>
            <Table cards>
              <thead>
                <tr>
                  {manage ? <SelectAllTh /> : null}
                  <SortTh field="number" sort={sort} base={BASE} keep={keep}>
                    {t("purchasing.order")}
                  </SortTh>
                  <Th>{t("purchasing.supplierWarehouse")}</Th>
                  <Th className="text-right">{t("purchasing.received")}</Th>
                  <SortTh
                    field="total"
                    sort={sort}
                    base={BASE}
                    keep={keep}
                    first="desc"
                    className="text-right"
                  >
                    {t("purchasing.total")}
                  </SortTh>
                  <SortTh field="created" sort={sort} base={BASE} keep={keep} first="desc">
                    {t("purchasing.created")}
                  </SortTh>
                  <Th>{t("purchasing.state")}</Th>
                  <Th>
                    <span className="vh">{t("purchasing.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const isOpen = open === o.id;
                  return [
                    <tr key={o.id} data-current={isOpen ? "" : undefined}>
                      {manage ? <SelectTd id={o.id} name={o.number} /> : null}
                      <Td className="rt-title">
                        <Link
                          className="open mono"
                          href={isOpen ? href({ open: null }) : `${href({ open: o.id })}#po-h`}
                          scroll={false}
                          aria-expanded={isOpen}
                        >
                          {o.number}
                        </Link>
                      </Td>
                      <Td label={t("purchasing.supplierWarehouse")}>
                        <span className="cell2">
                          {o.supplier_name}
                          <span className="sub">
                            {o.org_name}
                            {o.expected_on
                              ? ` · ${t("purchasing.expected", { date: formatDay(o.expected_on, locale) })}`
                              : ""}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("purchasing.received")} className="text-right">
                        {t("purchasing.receivedOf", { received: o.received, total: o.quantity })}
                      </Td>
                      <Td label={t("purchasing.total")} className="text-right whitespace-nowrap">
                        {money(o.total)}
                      </Td>
                      <Td label={t("purchasing.created")} className="whitespace-nowrap">
                        <Time value={o.created_at} date />
                      </Td>
                      <Td label={t("purchasing.state")}>
                        <span className={PURCHASE_BADGE[o.status]}>
                          <span className="dot" />
                          {t(`purchaseStatus.${o.status}`)}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        <span className="row-acts">
                          {primary(o)}
                          <RowMenu
                            label={tt("moreFor", { name: o.number })}
                            items={menu(o, isOpen)}
                          />
                        </span>
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${o.id}-open`} className="cat-detail-row">
                        <td colSpan={manage ? 8 : 7}>
                          <div className="cat-detail">
                            <h3 className="h2">
                              {o.number} · {o.supplier_name} → {o.org_name}
                            </h3>
                            <ul className="cat-lines">
                              {o.lines.map((l) => (
                                <li key={l.id}>
                                  <span>
                                    {name(l.variant_id)} · {l.quantity} × {money(l.unit_cost)}
                                  </span>
                                  <b>
                                    {t("purchasing.receivedOf", {
                                      received: l.received_quantity,
                                      total: l.quantity,
                                    })}
                                  </b>
                                </li>
                              ))}
                            </ul>
                            <p className="fhint">
                              {t("purchasing.orderedBy", { name: o.ordered_by.name })}
                            </p>
                            {o.note ? <p className="fhint">{o.note}</p> : null}
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          </BulkTable>
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
      </section>

      <section className="block" aria-labelledby="receipts-h">
        <div className="block-head">
          <h2 id="receipts-h" className="h2">
            {t("purchasing.receiptsTitle")}
          </h2>
          {receive ? (
            <ReceiptDialog
              orders={options.orders}
              suppliers={options.suppliers}
              warehouses={options.warehouses}
              reference=""
            />
          ) : null}
        </div>
        <p className="fhint">{t("purchasing.receiptsAbout")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("purchasing.receipt")}</Th>
                <Th>{t("purchasing.supplierSource")}</Th>
                <Th>{t("purchasing.date")}</Th>
                <Th className="text-right">{t("purchasing.value")}</Th>
                <Th>{t("purchasing.ledger")}</Th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}>
                  <Td className="rt-title mono">{r.number}</Td>
                  <Td label={t("purchasing.supplierSource")}>
                    <span className="cell2">
                      {r.supplier_name}
                      <span className="sub">
                        {r.purchase_order_number
                          ? t("purchasing.fromOrder", { number: r.purchase_order_number })
                          : t("purchasing.direct")}{" "}
                        · {r.org_name} · <span className="mono">{r.reference}</span>
                      </span>
                    </span>
                  </Td>
                  <Td label={t("purchasing.date")}>
                    <Time value={r.posted_at} date />
                  </Td>
                  <Td label={t("purchasing.value")} className="text-right whitespace-nowrap">
                    {money(r.total)}
                  </Td>
                  <Td label={t("purchasing.ledger")}>
                    <span className={LEDGER_BADGE[r.ledger_status]}>
                      <span className="dot" />
                      {t(`ledgerStatus.${r.ledger_status}`)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="block" aria-labelledby="returns-h">
        <div className="block-head">
          <h2 id="returns-h" className="h2">
            {t("purchasing.returnsTitle")}
          </h2>
          {manage ? <SupplierReturnDialog receipts={options.receipts} /> : null}
        </div>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("purchasing.returnNo")}</Th>
                <Th>{t("purchasing.supplierReason")}</Th>
                <Th>{t("purchasing.date")}</Th>
                <Th className="text-right">{t("purchasing.value")}</Th>
                <Th>{t("purchasing.ledger")}</Th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id}>
                  <Td className="rt-title mono">{r.number}</Td>
                  <Td label={t("purchasing.supplierReason")}>
                    <span className="cell2">
                      {r.supplier_name}
                      <span className="sub">
                        {r.reason}
                        {r.receipt_number
                          ? ` · ${t("purchasing.fromReceipt", { number: r.receipt_number })}`
                          : ""}
                      </span>
                    </span>
                  </Td>
                  <Td label={t("purchasing.date")}>
                    <Time value={r.posted_at} date />
                  </Td>
                  <Td label={t("purchasing.value")} className="text-right whitespace-nowrap">
                    {money(r.total)}
                  </Td>
                  <Td label={t("purchasing.ledger")}>
                    <span className={LEDGER_BADGE[r.ledger_status]}>
                      <span className="dot" />
                      {t(`ledgerStatus.${r.ledger_status}`)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("purchasing.ledgerNote")}</p>
      </section>
    </div>
  );
}
