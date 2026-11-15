import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  cancelTransferAction,
  closeTransferAction,
  receiveAllAction,
  shipTransferAction,
} from "@/app/(admin)/catalog/inventory/actions";
import { TRANSFER_BADGE } from "@/components/catalog/badges";
import { ReceivePartDialog, TransferDialog } from "@/components/inventory/forms";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatDay, INVENTORY_TRANSFER } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { can } from "@/lib/viewer";
import { allVariants } from "@/sample/catalog";
import { listTransfers, type TransferStatus, warehouses } from "@/sample/inventory";

const STATUSES: TransferStatus[] = [
  "draft",
  "in_transit",
  "partially_received",
  "received",
  "closed",
  "cancelled",
];

// Tab "Chuyển kho": nháp → đang đi đường → nhận một phần / đã nhận đủ → đã đóng. Gửi đi thì trừ kho
// nguồn; nhận thì cộng kho đích. Hàng đang đi đường không thuộc tồn bán được của kho nào.
export default async function TransfersPage(props: PageProps<"/catalog/inventory/transfers">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = STATUSES.find((s) => s === one("status"));
  const open = one("open");
  const [{ data: transfers }, { data: all }, units, { data: variants }, manage] = await Promise.all(
    [
      listTransfers(status ? { status } : {}),
      listTransfers(),
      warehouses(),
      allVariants(locale),
      can(INVENTORY_TRANSFER),
    ],
  );
  const name = (id: string) => {
    const v = variants.find((x) => x.variant_id === id);
    return v ? `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}` : id;
  };
  const options = units.map((u) => ({ value: u.id, label: u.name }));
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
            href="/catalog/inventory/transfers"
            aria-current={status ? undefined : "page"}
          >
            {t("transfers.all")} <span className="cnt">{all.length}</span>
          </Link>
          {STATUSES.slice(0, 5).map((s) => (
            <Link
              key={s}
              className={status === s ? "chip on" : "chip"}
              href={`/catalog/inventory/transfers?status=${s}`}
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
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("transfers.number")}</Th>
                  <Th>{t("transfers.route")}</Th>
                  <Th>{t("transfers.goods")}</Th>
                  <Th>{t("transfers.date")}</Th>
                  <Th>{t("transfers.state")}</Th>
                  <Th>
                    <span className="vh">{t("transfers.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((tr) => {
                  const isOpen = open === tr.id;
                  const base = status
                    ? `/catalog/inventory/transfers?status=${status}`
                    : "/catalog/inventory/transfers";
                  return [
                    <tr key={tr.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <Link
                          className="open mono"
                          href={
                            isOpen ? base : `${base}${status ? "&" : "?"}open=${tr.id}#transfers-h`
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
                              {t("transfers.expected", { date: formatDay(tr.expected_on, locale) })}
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
                        {manage ? (
                          <span className="row-acts">
                            {tr.status === "draft" ? (
                              <>
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
                                <ConfirmAction
                                  action={cancelTransferAction}
                                  id={tr.id}
                                  label={t("transfers.cancel")}
                                  title={t("transfers.cancelTitle", { number: tr.number })}
                                  points={[t("transfers.cancelPoint")]}
                                  submit={t("transfers.cancelSubmit")}
                                  done={t("transfers.cancelled")}
                                />
                              </>
                            ) : null}
                            {tr.status === "in_transit" || tr.status === "partially_received" ? (
                              <>
                                <InlineAction
                                  action={receiveAllAction}
                                  id={tr.id}
                                  label={t("transfers.receiveAll")}
                                  ariaLabel={`${t("transfers.receiveAll")} ${tr.number}`}
                                  done={t("transfers.received")}
                                />
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
                              </>
                            ) : null}
                            {tr.status === "partially_received" || tr.status === "received" ? (
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
                            ) : null}
                          </span>
                        ) : null}
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${tr.id}-open`} className="cat-detail-row">
                        <td colSpan={6}>
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
          )}
        </div>
      </section>
    </div>
  );
}
