import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { trackAction } from "@/app/(admin)/sales/shipping/actions";
import { DISCREPANCY_BADGE, MATCH_BADGE, STATEMENT_BADGE } from "@/components/shipping/badges";
import { ImportDialog, ResolveDialog } from "@/components/shipping/forms";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { formatCount, formatMoney } from "@/lib/format";
import { vnDateTime } from "@/lib/promotions";
import {
  codStats,
  listCarrierAccounts,
  listDiscrepancies,
  listStatements,
  type StatementStatus,
} from "@/sample/shipping";
import { TAB_PERMISSIONS } from "../shared";

const STATEMENT_FILTERS: StatementStatus[] = ["has_mismatch", "reconciled"];

// Tab "Đối soát COD": hãng thu tiền khi giao rồi chuyển theo bảng kê. Nhập bảng kê để khớp với vận đơn
// đã giao; dòng không khớp vào danh sách lệch. Hệ thống chỉ ghi nghĩa vụ trong sổ cái, không nhận hay
// giữ tiền (D-187 của core).
export default async function CodPage(props: PageProps<"/sales/shipping/cod">) {
  const gate = await commerceGate(TAB_PERMISSIONS.cod);
  if (gate) return gate;
  const [t, locale, params] = await Promise.all([
    getTranslations("shipping"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = STATEMENT_FILTERS.find((s) => s === one("status"));
  const open = one("open");
  const show = one("show") === "resolved" ? "resolved" : "open";
  const [
    { data: stats },
    { data: statements },
    { data: all },
    { data: lines },
    { data: carriers },
  ] = await Promise.all([
    codStats(),
    listStatements(status ? { status } : {}),
    listStatements(),
    listDiscrepancies({ status: show }),
    listCarrierAccounts(),
  ]);
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: status ?? "", show: show === "open" ? "" : show, ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/sales/shipping/cod?${query}` : "/sales/shipping/cod";
  };
  return (
    <div className="blocks">
      <section className="block" aria-label={t("cod.kpis")}>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("cod.kpiReceivable")}</span>
            <b className="kpi-value">{money(stats.receivable.amount)}</b>
            <span className="kpi-sub">{t("cod.kpiReceivableSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("cod.kpiMismatch")}</span>
            <b className="kpi-value">{money(stats.open_mismatch.amount)}</b>
            <span className="kpi-sub">{t("cod.kpiMismatchSub", { count: stats.open_count })}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("cod.kpiOverdue")}</span>
            <b className="kpi-value">{formatCount(stats.overdue, locale)}</b>
            <span className="kpi-sub">{t("cod.kpiOverdueSub")}</span>
          </div>
        </div>
      </section>
      <p className="note">
        <b>{t("cod.whereStrong")}</b> {t("cod.whereText")}
      </p>

      <section className="block" aria-labelledby="statements-h">
        <div className="block-head">
          <h2 id="statements-h" className="h2">
            {t("cod.statements")}
          </h2>
          <ImportDialog carriers={carriers.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
        <p className="fhint">{t("cod.statementsAbout")}</p>
        <nav className="chips" aria-label={t("cod.byStatus")}>
          <Link
            className={status ? "chip" : "chip on"}
            href={href({ status: null, open: null })}
            aria-current={status ? undefined : "page"}
          >
            {t("shipments.all")} <span className="cnt">{all.length}</span>
          </Link>
          {STATEMENT_FILTERS.map((s) => (
            <Link
              key={s}
              className={status === s ? "chip on" : "chip"}
              href={href({ status: s, open: null })}
              aria-current={status === s ? "page" : undefined}
            >
              {t(`statementStatus.${s}`)}{" "}
              <span className="cnt">{all.filter((x) => x.status === s).length}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("cod.statement")}</Th>
                <Th>{t("cod.period")}</Th>
                <Th className="text-right">{t("cod.total")}</Th>
                <Th className="text-right">{t("cod.fee")}</Th>
                <Th className="text-right">{t("cod.net")}</Th>
                <Th>{t("cod.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => {
                const isOpen = open === s.id;
                return [
                  <tr key={s.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link
                          className="open mono"
                          href={
                            isOpen ? href({ open: null }) : `${href({ open: s.id })}#statements-h`
                          }
                          scroll={false}
                          aria-expanded={isOpen}
                        >
                          {s.statement_reference}
                        </Link>
                        <span className="sub">{s.carrier_name}</span>
                      </span>
                    </Td>
                    <Td label={t("cod.period")}>
                      {formatDay(s.period_from, locale)} – {formatDay(s.period_to, locale)}
                    </Td>
                    <Td label={t("cod.total")} className="text-right num">
                      {money(s.total_cod.amount)}
                    </Td>
                    <Td label={t("cod.fee")} className="text-right num">
                      {money(s.total_fee.amount)}
                    </Td>
                    <Td label={t("cod.net")} className="text-right num">
                      {money(s.net_paid.amount)}
                    </Td>
                    <Td label={t("cod.state")}>
                      <span className={STATEMENT_BADGE[s.status]}>
                        <span className="dot" />
                        {t(`statementStatus.${s.status}`)}
                      </span>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${s.id}-open`} className="cat-detail-row">
                      <td colSpan={6}>
                        <div className="cat-detail">
                          <h3 className="h2">
                            {t("cod.statementTitle", { reference: s.statement_reference })}
                          </h3>
                          <p className="fhint">
                            {t(`cod.payee.${s.payee}`)} ·{" "}
                            {t("cod.importedBy", {
                              name: s.imported_by.name,
                              date: vnDateTime(s.imported_at, locale),
                            })}
                          </p>
                          <ul className="cat-lines">
                            {s.lines.map((l) => (
                              <li key={l.id}>
                                <span className="cell2">
                                  <span className="mono">{l.tracking_number}</span>
                                  <span className="sub">
                                    {l.order_number ?? t("cod.unknownOrder")}
                                  </span>
                                </span>
                                <span className="cell2">
                                  <b className="num">
                                    {money(l.cod.amount)} − {money(l.fee.amount)}
                                  </b>
                                  <span className={MATCH_BADGE[l.match]}>
                                    <span className="dot" />
                                    {t(`match.${l.match}`)}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="fhint">{t("cod.ledgerNote")}</p>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="block" aria-labelledby="mismatch-h">
        <div className="block-head">
          <h2 id="mismatch-h" className="h2">
            {t("cod.mismatches")}
          </h2>
        </div>
        <p className="fhint">{t("cod.mismatchesAbout")}</p>
        <nav className="chips" aria-label={t("cod.byResolution")}>
          {(["open", "resolved"] as const).map((s) => (
            <Link
              key={s}
              className={show === s ? "chip on" : "chip"}
              href={href({ show: s === "open" ? null : s, open: null })}
              aria-current={show === s ? "page" : undefined}
            >
              {t(`discrepancyStatus.${s}`)}
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {lines.length === 0 ? (
            <p className="empty">{t("cod.noMismatch")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("cod.tracking")}</Th>
                  <Th>{t("cod.kind")}</Th>
                  <Th className="text-right">{t("cod.reported")}</Th>
                  <Th className="text-right">{t("cod.expected")}</Th>
                  <Th>{t("cod.state")}</Th>
                  <Th>
                    <span className="vh">{t("rates.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((d) => (
                  <tr key={d.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <span className="mono">{d.tracking_number}</span>
                        <span className="sub">
                          {d.order_number ?? t("cod.unknownOrder")}
                          {d.statement_reference ? ` · ${d.statement_reference}` : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("cod.kind")}>
                      <span className="cell2">
                        <span>{t(`discrepancyKind.${d.kind}`)}</span>
                        {d.status === "resolved" ? (
                          <span className="sub">
                            {t.has(`resolution.${d.resolution_note}`)
                              ? t(`resolution.${d.resolution_note}`)
                              : d.resolution_note}
                            {d.resolved_by ? ` · ${d.resolved_by.name}` : ""}
                          </span>
                        ) : (
                          <span className="sub">
                            {t("cod.reportedLine", {
                              cod: money(d.reported.amount),
                              fee: money(d.reported_fee.amount),
                            })}
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td label={t("cod.reported")} className="text-right num">
                      {money(String(Number(d.reported.amount) - Number(d.reported_fee.amount)))}
                    </Td>
                    <Td label={t("cod.expected")} className="text-right num">
                      {money(d.expected.amount)}
                    </Td>
                    <Td label={t("cod.state")}>
                      <span className={DISCREPANCY_BADGE[d.status]}>
                        <span className="dot" />
                        {t(`discrepancyStatus.${d.status}`)}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      {d.status === "open" ? (
                        <span className="row-acts">
                          {d.shipment_id && d.kind === "not_delivered" ? (
                            <ConfirmAction
                              action={trackAction}
                              id={d.shipment_id}
                              label={t("cod.trackMatch")}
                              title={t("cod.trackTitle", { tracking: d.tracking_number })}
                              points={[
                                t("cod.trackAsk"),
                                t("cod.trackLedger"),
                                t("cod.trackFinal"),
                              ]}
                              submit={t("cod.trackSubmit")}
                              done={t("cod.tracked")}
                              danger={false}
                            />
                          ) : null}
                          <ResolveDialog id={d.id} tracking={d.tracking_number} />
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
