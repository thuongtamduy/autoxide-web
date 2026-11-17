import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkPostSettlementAction,
  bulkResolveLinesAction,
  postSettlementAction,
} from "@/app/(admin)/sales/channels/actions";
import { ResolveLineDialog } from "@/components/channels/forms";
import {
  BlockHead,
  Cell2,
  DetailRow,
  hrefWith,
  Kpis,
  Lines,
  OpenLink,
  param,
  Status,
} from "@/components/growth/blocks";
import { MoneyConfirm } from "@/components/orders/forms";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatDay } from "@/lib/catalog";
import { CHANNELS_FINANCE_MANAGE, percentText } from "@/lib/channels";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  listSettlements,
  type SettlementStatus,
  settlementLines,
  settlementSummary,
} from "@/sample/channels";
import { CHANNEL_TABS } from "../shared";

const TONE: Record<SettlementStatus, string> = {
  imported: "b-info",
  matched: "b-ok",
  mismatch: "b-warn",
  posted: "b-ok",
};
const LEDGER = [
  ["fee", "channel_fee_expense", "channel_receivable"],
  ["bank", "bank_clearing", "channel_receivable"],
  ["subsidy", "channel_receivable", "channel_subsidy_income"],
] as const;

// Tab "Đối soát": mỗi ngày kéo bảng kê chi trả của kênh, khớp từng dòng với đơn, ghi sổ cái. Dòng lệch vào
// hàng chờ xử lý tay; bảng kê chỉ ghi sổ khi hết dòng lệch. Bảng kê và bút toán lưu ít nhất 10 năm (Luật Kế
// toán 88/2015). Tiền do kênh thu rồi trả về ngân hàng của cửa hàng — Autoxide không giữ tiền (D-187).
// Bảng kê đã khớp hiện nút "Ghi sổ" trên dòng; chọn nhiều để ghi sổ (hỏi lại, không đảo được). Dòng lệch
// hiện nút "Đánh dấu đã xử lý"; chọn nhiều để đóng cùng một ghi chú (lặp lệnh từng dòng, gom lỗi).
export default async function SettlementsPage(props: PageProps<"/sales/channels/settlements">) {
  if (!(await can(CHANNEL_TABS.settlements))) notFound();
  const [t, tt, locale, params, summary, settlements, mismatches, manage] = await Promise.all([
    getTranslations("channels"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
    settlementSummary(),
    listSettlements(),
    settlementLines(),
    can(CHANNELS_FINANCE_MANAGE),
  ]);
  const open = param(params, "open");
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const openLines = mismatches.data.filter((l) => l.status !== "matched");
  return (
    <div className="blocks">
      <Kpis
        label={t("settle.kpis")}
        items={[
          {
            label: t("settle.kpiOwed"),
            value: money(summary.receivable.amount),
            sub: t("settle.kpiOwedSub"),
          },
          {
            label: t("settle.kpiPaid"),
            value: money(summary.paid_30d.amount),
            sub: t("settle.kpiPaidSub"),
          },
          {
            label: t("settle.kpiFees"),
            value: money(summary.fees_30d.amount),
            sub: t("settle.kpiFeesSub"),
          },
          {
            label: t("settle.kpiMismatch"),
            value: formatCount(summary.open_mismatches, locale),
            sub: t("settle.kpiMismatchSub"),
          },
        ]}
      />
      <section className="block" aria-labelledby="statements-h">
        <BlockHead id="statements-h" title={t("settle.title")} about={t("settle.about")} />
        <div className="card tcard">
          <BulkTable
            ids={settlements.data.map((x) => x.id)}
            actions={
              manage
                ? [
                    {
                      key: "post",
                      label: t("settle.post"),
                      tone: "pri",
                      run: bulkPostSettlementAction,
                      confirm: {
                        title: t("settle.bulkPostTitle"),
                        points: [t("settle.bulkPostOnly"), t("settle.postWarn")],
                        submit: t("settle.postSubmit"),
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
                  <Th>{t("settle.period")}</Th>
                  <Th>{t("settle.account")}</Th>
                  <Th>{t("settle.payoutId")}</Th>
                  <Th className="text-right">{t("settle.payout")}</Th>
                  <Th>{t("settle.state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {settlements.data.map((x) => {
                  const isOpen = open === x.id;
                  const fees = x.fees.reduce((s, f) => s + Number(f.amount.amount), 0);
                  const name = `${x.external_payout_id}`;
                  return [
                    <tr key={x.id} data-current={isOpen ? "" : undefined}>
                      {manage ? <SelectTd id={x.id} name={name} /> : null}
                      <Td className="rt-title">
                        <span className="cell2">
                          <OpenLink
                            open={isOpen}
                            href={hrefWith(
                              "/sales/channels/settlements",
                              {},
                              { open: x.id },
                              "#statements-h",
                            )}
                            closeHref="/sales/channels/settlements"
                          >
                            {formatDay(x.period_from, locale)} – {formatDay(x.period_to, locale)}
                          </OpenLink>
                          <span className="sub">{t("settle.lines", { n: x.line_count })}</span>
                        </span>
                      </Td>
                      <Td label={t("settle.account")}>
                        <Cell2 main={x.account_name} sub={t(`kinds.${x.kind}`)} />
                      </Td>
                      <Td label={t("settle.payoutId")} className="mono">
                        {x.external_payout_id}
                      </Td>
                      <Td label={t("settle.payout")} className="text-right num">
                        {money(x.payout.amount)}
                      </Td>
                      <Td label={t("settle.state")}>
                        <Status tone={TONE[x.status]}>{t(`settleState.${x.status}`)}</Status>
                      </Td>
                      <Td className="rt-acts">
                        <span className="row-acts">
                          {manage && x.status === "matched" ? (
                            <MoneyConfirm
                              action={postSettlementAction}
                              fields={{ id: x.id }}
                              label={t("settle.post")}
                              title={t("settle.postTitle", { id: x.external_payout_id })}
                              rows={[
                                [t("settle.account"), x.account_name],
                                [t("settle.revenueShort"), money(x.revenue.amount)],
                                [t("settle.feesShort"), money(fees)],
                                [t("settle.net"), money(x.payout.amount)],
                              ]}
                              warn={t("settle.postWarn")}
                              submit={t("settle.postSubmit")}
                              done={t("settle.posted")}
                            />
                          ) : null}
                          <RowMenu
                            label={tt("moreFor", { name })}
                            items={[
                              {
                                label: isOpen ? t("settle.hideDetail") : t("settle.openDetail"),
                                href: isOpen
                                  ? "/sales/channels/settlements"
                                  : hrefWith(
                                      "/sales/channels/settlements",
                                      {},
                                      { open: x.id },
                                      "#statements-h",
                                    ),
                              },
                            ]}
                          />
                        </span>
                      </Td>
                    </tr>,
                    isOpen ? (
                      <DetailRow key={`${x.id}-open`} cols={manage ? 7 : 6}>
                        <h3 className="h2">
                          {t("settle.statement", { id: x.external_payout_id })}
                        </h3>
                        <Lines
                          total
                          items={[
                            [t("settle.revenue", { n: x.line_count }), money(x.revenue.amount)],
                            ...x.fees.map(
                              (f) =>
                                [
                                  t(`fees.${f.code}`, { pct: percentText(f.rate_bp, locale) }),
                                  `−${money(f.amount.amount)}`,
                                ] as const,
                            ),
                            [t("settle.subsidy"), `+${money(x.subsidy.amount)}`],
                            [t("settle.net"), money(x.payout.amount)],
                          ]}
                        />
                        <p className="fhint">
                          {x.status === "posted"
                            ? t("settle.postedAt", { fees: money(fees) })
                            : x.status === "mismatch"
                              ? t("settle.waitMismatch", { n: x.mismatch_count })
                              : t("settle.readyToPost")}
                        </p>
                        <p className="fhint">{t("settle.taxNote")}</p>
                        {x.posted_at ? (
                          <p className="fhint">
                            {t("settle.postedOn")} <Time value={x.posted_at} />
                          </p>
                        ) : null}
                      </DetailRow>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          </BulkTable>
        </div>
      </section>
      <section className="block" aria-labelledby="mismatch-h">
        <BlockHead
          id="mismatch-h"
          title={t("settle.mismatchTitle")}
          about={t("settle.mismatchAbout")}
        />
        <div className="card tcard">
          {openLines.length === 0 ? (
            <p className="empty">{t("settle.noMismatch")}</p>
          ) : (
            <BulkTable
              ids={openLines.filter((l) => l.status === "mismatch").map((l) => l.id)}
              actions={
                manage
                  ? [
                      {
                        key: "resolve",
                        label: t("line.button"),
                        run: bulkResolveLinesAction,
                        confirm: {
                          title: t("settle.bulkResolveTitle"),
                          points: [t("settle.bulkResolveFinal")],
                          submit: t("line.submit"),
                        },
                        field: { label: t("line.note") },
                      },
                    ]
                  : []
              }
            >
              <Table cards>
                <thead>
                  <tr>
                    {manage ? <SelectAllTh /> : null}
                    <Th>{t("settle.external")}</Th>
                    <Th className="text-right">{t("settle.channelSays")}</Th>
                    <Th className="text-right">{t("settle.weSay")}</Th>
                    <Th>{t("settle.reason")}</Th>
                    <Th>{t("settle.state")}</Th>
                    <Th>
                      <span className="vh">{t("actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {openLines.map((l) => {
                    const menu: RowMenuItem[] = l.order_id
                      ? [{ label: t("settle.openOrder"), href: `/sales/orders/${l.order_id}` }]
                      : [];
                    return (
                      <tr key={l.id}>
                        {manage ? (
                          l.status === "mismatch" ? (
                            <SelectTd id={l.id} name={l.order_number ?? l.external_order_id} />
                          ) : (
                            <td className="t-sel border-b border-border px-3 py-2" />
                          )
                        ) : null}
                        <Td className="rt-title">
                          <Cell2
                            main={<span className="mono">{l.external_order_id}</span>}
                            sub={
                              l.order_id ? (
                                <Link className="mono" href={`/sales/orders/${l.order_id}`}>
                                  {l.order_number}
                                </Link>
                              ) : (
                                t("settle.noOrder")
                              )
                            }
                          />
                        </Td>
                        <Td label={t("settle.channelSays")} className="text-right num">
                          {money(l.revenue.amount)}
                        </Td>
                        <Td label={t("settle.weSay")} className="text-right num">
                          {l.recorded ? money(l.recorded.amount) : "—"}
                        </Td>
                        <Td label={t("settle.reason")}>
                          <Cell2
                            main={l.reason ? t(`mismatch.${l.reason}`) : "—"}
                            sub={l.note ?? t(`mismatchHint.${l.reason ?? "order_not_found"}`)}
                          />
                        </Td>
                        <Td label={t("settle.state")}>
                          <Status tone={l.status === "mismatch" ? "b-warn" : "b-arch"}>
                            {t(`lineState.${l.status}`)}
                          </Status>
                        </Td>
                        <Td className="rt-acts">
                          <span className="row-acts">
                            {manage && l.status === "mismatch" ? (
                              <ResolveLineDialog
                                id={l.id}
                                order={l.order_number ?? l.external_order_id}
                              />
                            ) : null}
                            {menu.length > 0 ? (
                              <RowMenu
                                label={tt("moreFor", {
                                  name: l.order_number ?? l.external_order_id,
                                })}
                                items={menu}
                              />
                            ) : null}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
      </section>
      <section className="block half" aria-labelledby="ledger-h">
        <BlockHead id="ledger-h" title={t("settle.ledgerTitle")} about={t("settle.ledgerAbout")} />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("settle.event")}</Th>
                <Th>{t("settle.debit")}</Th>
                <Th>{t("settle.credit")}</Th>
              </tr>
            </thead>
            <tbody>
              {LEDGER.map(([k, d, c]) => (
                <tr key={k}>
                  <Td className="rt-title">{t(`ledger.${k}`)}</Td>
                  <Td label={t("settle.debit")} className="mono">
                    {d}
                  </Td>
                  <Td label={t("settle.credit")} className="mono">
                    {c}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
      <section className="block half" aria-labelledby="owed-h">
        <BlockHead id="owed-h" title={t("settle.owedTitle")} about={t("settle.owedAbout")} />
        <Lines
          total
          items={[
            ...summary.by_account.map(
              (a) =>
                [
                  `${a.account_name} · ${t(`kinds.${a.kind}`)}`,
                  money(a.receivable.amount),
                ] as const,
            ),
            [t("settle.owedTotal"), money(summary.receivable.amount)] as const,
          ]}
        />
      </section>
    </div>
  );
}
