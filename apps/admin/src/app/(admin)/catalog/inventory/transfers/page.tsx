import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkCancelTransfersAction,
  bulkReceiveTransfersAction,
  bulkShipTransfersAction,
  cancelTransferAction,
  closeTransferAction,
  receiveAllAction,
  shipTransferAction,
} from "@/app/(admin)/catalog/inventory/actions";
import { TRANSFER_BADGE } from "@/components/catalog/badges";
import { ReceivePartDialog, TransferDialog } from "@/components/inventory/forms";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatDay, INVENTORY_TRANSFER } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { readPage, readSort, slicePage, withQuery } from "@/lib/table";
import { can } from "@/lib/viewer";
import { allVariants } from "@/sample/catalog";
import {
  listTransfers,
  TRANSFER_SORTS,
  type TransferRow,
  type TransferStatus,
  warehouses,
} from "@/sample/inventory";

const STATUSES: TransferStatus[] = [
  "draft",
  "in_transit",
  "partially_received",
  "received",
  "closed",
  "cancelled",
];

const BASE = "/catalog/inventory/transfers";

// Tab "Chuyển kho": nháp → đang đi đường → nhận một phần / đã nhận đủ → đã đóng. Gửi đi thì trừ kho
// nguồn; nhận thì cộng kho đích. Hàng đang đi đường không thuộc tồn bán được của kho nào. Bộ bảng
// chuẩn (W-058): dòng hiện một nút phụ theo trạng thái (gửi đi / nhận đủ / đóng), còn lại trong "⋯";
// chọn nhiều để gửi đi, nhận đủ hay huỷ (lặp lệnh từng phiếu, gom lỗi); sắp theo số phiếu, ngày tạo.
export default async function TransfersPage(props: PageProps<"/catalog/inventory/transfers">) {
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = STATUSES.find((s) => s === one("status"));
  const open = one("open");
  const sorted = one("sort") !== "";
  const sort = readSort(params, TRANSFER_SORTS, { field: "created", dir: "desc" });
  const paging = readPage(params);
  const [{ data: listed }, { data: all }, units, { data: variants }, manage] = await Promise.all([
    listTransfers({ ...(status ? { status } : {}), sort: sorted ? sort : null }),
    listTransfers(),
    warehouses(),
    allVariants(locale),
    can(INVENTORY_TRANSFER),
  ]);
  const page = slicePage(listed, paging.page, paging.per);
  const transfers = page.data;
  const keep = { status: status ?? "", ...(sorted ? { sort: sort.field, dir: sort.dir } : {}) };
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
  const name = (id: string) => {
    const v = variants.find((x) => x.variant_id === id);
    return v ? `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}` : id;
  };
  const options = units.map((u) => ({ value: u.id, label: u.name }));

  const ship = (tr: TransferRow) => (
    <ConfirmAction
      action={shipTransferAction}
      id={tr.id}
      label={t("transfers.ship")}
      title={t("transfers.shipTitle", { number: tr.number })}
      points={[
        t("transfers.shipOut", { from: tr.from_name }),
        t("transfers.shipIncoming", { to: tr.to_name }),
      ]}
      submit={t("transfers.shipSubmit")}
      done={t("transfers.shippedDone")}
      danger={false}
    />
  );
  const close = (tr: TransferRow) => (
    <ConfirmAction
      action={closeTransferAction}
      id={tr.id}
      label={t("transfers.close")}
      title={t("transfers.closeTitle", { number: tr.number })}
      points={[t("transfers.closePoint"), t("transfers.closeShort")]}
      submit={t("transfers.closeSubmit")}
      done={t("transfers.closed")}
      danger={false}
    />
  );
  // Nút phụ hiện trên dòng: bước kế tiếp của phiếu (tối đa một nút, theo quy ước của W-058).
  const primary = (tr: TransferRow) =>
    tr.status === "draft" ? (
      ship(tr)
    ) : tr.status === "in_transit" || tr.status === "partially_received" ? (
      <InlineAction
        action={receiveAllAction}
        id={tr.id}
        label={t("transfers.receiveAll")}
        ariaLabel={`${t("transfers.receiveAll")} ${tr.number}`}
        done={t("transfers.received")}
      />
    ) : tr.status === "received" ? (
      close(tr)
    ) : null;
  const menu = (tr: TransferRow, isOpen: boolean): RowMenuItem[] => [
    {
      label: isOpen ? t("transfers.hide") : t("transfers.view"),
      href: isOpen ? href({ open: null }) : `${href({ open: tr.id })}#transfers-h`,
    },
    ...(manage && (tr.status === "in_transit" || tr.status === "partially_received")
      ? [
          {
            label: t("transfers.receivePart"),
            dialog: (
              <ReceivePartDialog
                id={tr.id}
                number={tr.number}
                lines={tr.lines
                  .filter((l) => l.received_quantity < l.quantity)
                  .map((l) => ({
                    id: l.id,
                    label: name(l.variant_id),
                    left: l.quantity - l.received_quantity,
                  }))}
              />
            ),
          },
        ]
      : []),
    ...(manage && tr.status === "partially_received"
      ? [{ label: t("transfers.close"), dialog: close(tr) }]
      : []),
    ...(manage && tr.status === "draft"
      ? [
          {
            label: t("transfers.cancel"),
            danger: true,
            dialog: (
              <ConfirmAction
                action={cancelTransferAction}
                id={tr.id}
                label={t("transfers.cancel")}
                title={t("transfers.cancelTitle", { number: tr.number })}
                points={[t("transfers.cancelPoint")]}
                submit={t("transfers.cancelSubmit")}
                done={t("transfers.cancelled")}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="blocks">
      <section className="block" aria-labelledby="transfers-h">
        <div className="block-head">
          <h2 id="transfers-h" className="h2">
            {t("transfers.title")}
          </h2>
          {manage ? <TransferDialog warehouses={options} primary /> : null}
        </div>
        <p className="fhint">{t("transfers.about")}</p>
        <nav className="chips" aria-label={t("transfers.byStatus")}>
          <Link
            className={status ? "chip" : "chip on"}
            href={withQuery(BASE, keep, { status: null })}
            aria-current={status ? undefined : "page"}
          >
            {t("transfers.all")} <span className="cnt">{all.length}</span>
          </Link>
          {STATUSES.slice(0, 5).map((s) => (
            <Link
              key={s}
              className={status === s ? "chip on" : "chip"}
              href={withQuery(BASE, keep, { status: s })}
              aria-current={status === s ? "page" : undefined}
            >
              {t(`transferStatus.${s}`)}{" "}
              <span className="cnt">{all.filter((x) => x.status === s).length}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {transfers.length === 0 ? (
            <p className="empty">{t("transfers.empty")}</p>
          ) : (
            <BulkTable
              ids={transfers.map((tr) => tr.id)}
              actions={
                manage
                  ? [
                      {
                        key: "ship",
                        label: t("transfers.ship"),
                        tone: "pri",
                        run: bulkShipTransfersAction,
                        confirm: {
                          title: t("transfers.bulkShipTitle"),
                          points: [t("transfers.bulkShipPoint"), t("transfers.bulkDraftOnly")],
                          submit: t("transfers.shipSubmit"),
                        },
                      },
                      {
                        key: "receive",
                        label: t("transfers.receiveAll"),
                        run: bulkReceiveTransfersAction,
                      },
                      {
                        key: "cancel",
                        label: t("transfers.cancel"),
                        tone: "danger",
                        run: bulkCancelTransfersAction,
                        confirm: {
                          title: t("transfers.bulkCancelTitle"),
                          points: [t("transfers.cancelPoint"), t("transfers.bulkDraftOnly")],
                          submit: t("transfers.cancelSubmit"),
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
                    <SortTh field="number" sort={sort} base={BASE} keep={keep}>
                      {t("transfers.number")}
                    </SortTh>
                    <Th>{t("transfers.route")}</Th>
                    <Th>{t("transfers.goods")}</Th>
                    <SortTh field="created" sort={sort} base={BASE} keep={keep} first="desc">
                      {t("transfers.date")}
                    </SortTh>
                    <Th>{t("transfers.state")}</Th>
                    <Th>
                      <span className="vh">{t("transfers.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((tr) => {
                    const isOpen = open === tr.id;
                    return [
                      <tr key={tr.id} data-current={isOpen ? "" : undefined}>
                        {manage ? <SelectTd id={tr.id} name={tr.number} /> : null}
                        <Td className="rt-title">
                          <Link
                            className="open mono"
                            href={
                              isOpen ? href({ open: null }) : `${href({ open: tr.id })}#transfers-h`
                            }
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {tr.number}
                          </Link>
                        </Td>
                        <Td label={t("transfers.route")}>
                          <span className="cell2">
                            {tr.from_name} → {tr.to_name}
                            {tr.note ? <span className="sub">{tr.note}</span> : null}
                          </span>
                        </Td>
                        <Td label={t("transfers.goods")}>
                          {t("transfers.lines", {
                            lines: tr.lines.length,
                            quantity: formatCount(tr.total_quantity, locale),
                          })}
                        </Td>
                        <Td label={t("transfers.date")}>
                          <span className="cell2">
                            {tr.shipped_at ? (
                              <span>
                                {t("transfers.shipped")} <Time value={tr.shipped_at} date />
                              </span>
                            ) : (
                              <span>
                                {t("transfers.created")} <Time value={tr.created_at} date />
                              </span>
                            )}
                            {tr.status === "in_transit" && tr.expected_on ? (
                              <span className="sub">
                                {t("transfers.expected", {
                                  date: formatDay(tr.expected_on, locale),
                                })}
                              </span>
                            ) : tr.status === "partially_received" ? (
                              <span className="sub">
                                {t("transfers.receivedOf", {
                                  received: tr.total_received,
                                  total: tr.total_quantity,
                                })}
                              </span>
                            ) : null}
                          </span>
                        </Td>
                        <Td label={t("transfers.state")}>
                          <span className={TRANSFER_BADGE[tr.status]}>
                            <span className="dot" />
                            {t(`transferStatus.${tr.status}`)}
                          </span>
                        </Td>
                        <Td className="rt-acts">
                          <span className="row-acts">
                            {manage ? primary(tr) : null}
                            <RowMenu
                              label={tt("moreFor", { name: tr.number })}
                              items={menu(tr, isOpen)}
                            />
                          </span>
                        </Td>
                      </tr>,
                      isOpen ? (
                        <tr key={`${tr.id}-open`} className="cat-detail-row">
                          <td colSpan={manage ? 7 : 6}>
                            <div className="cat-detail">
                              <h3 className="h2">
                                {tr.number} · {tr.from_name} → {tr.to_name}
                              </h3>
                              <ul className="cat-lines">
                                {tr.lines.map((l) => (
                                  <li key={l.id}>
                                    <span>{name(l.variant_id)}</span>
                                    <b>
                                      {t("transfers.lineQty", {
                                        received: l.received_quantity,
                                        quantity: l.quantity,
                                      })}
                                    </b>
                                  </li>
                                ))}
                              </ul>
                              {tr.reference ? (
                                <p className="fhint">
                                  {t("transfers.reference", { reference: tr.reference })}
                                </p>
                              ) : null}
                              <p className="fhint">{t(`transfers.notes.${tr.status}`)}</p>
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
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
      </section>
    </div>
  );
}
