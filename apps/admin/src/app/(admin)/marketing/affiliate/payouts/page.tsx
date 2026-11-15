import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { retryPayoutAction } from "@/app/(admin)/marketing/affiliate/actions";
import { MarkPaidDialog } from "@/components/affiliate/forms";
import {
  BlockHead,
  Cell2,
  DetailRow,
  hrefWith,
  Kpis,
  KV,
  Lines,
  OpenLink,
  param,
  Status,
} from "@/components/growth/blocks";
import { MoneyConfirm } from "@/components/orders/forms";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { AFFILIATE_FINANCE } from "@/lib/affiliate";
import { formatDay } from "@/lib/catalog";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { listPayouts, listPitRules, type PayoutStatus } from "@/sample/affiliate";
import { AFFILIATE_TABS } from "../shared";

const TONE: Record<PayoutStatus, string> = {
  building: "b-violet",
  sent: "b-info",
  paid: "b-ok",
  failed: "b-bad",
  cancelled: "b-arch",
};

// Tab "Chi trả": mỗi người một lệnh chi mỗi kỳ (không tách nhỏ để né ngưỡng khấu trừ). Khấu trừ thuế TNCN
// tính trên cả lệnh chi theo dữ liệu thuế có ngày hiệu lực (ảnh chụp lưu trên lệnh). Tiền hoa hồng là tiền
// của cửa hàng: chi qua đối tác chi có giấy phép, hoặc kế toán tự chuyển khoản rồi ghi mã giao dịch (D-187).
export default async function PayoutsPage(props: PageProps<"/marketing/affiliate/payouts">) {
  if (!(await can(AFFILIATE_TABS.payouts))) notFound();
  const [t, locale, params, payouts, pit, finance] = await Promise.all([
    getTranslations("affiliate"),
    getLocale(),
    props.searchParams,
    listPayouts(),
    listPitRules(),
    can(AFFILIATE_FINANCE),
  ]);
  const open = param(params, "open");
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const sum = (key: "gross" | "withheld" | "net", list = payouts.data) =>
    list.reduce((s, p) => s + Number(p[key].amount), 0);
  const paid = payouts.data.filter((p) => p.status === "paid");
  const waiting = payouts.data.filter((p) => p.status !== "paid" && p.status !== "cancelled");
  const period = payouts.data[0];
  return (
    <div className="blocks">
      <Kpis
        label={t("payouts.kpis")}
        items={[
          {
            label: t("payouts.kpiPeriod", {
              from: formatDay(period?.period_from ?? "", locale),
              to: formatDay(period?.period_to ?? "", locale),
            }),
            value: money(sum("gross")),
            sub: t("payouts.kpiPeriodSub", { n: payouts.data.length }),
          },
          {
            label: t("payouts.kpiWithheld"),
            value: money(sum("withheld")),
            sub: t("payouts.kpiWithheldSub"),
          },
          {
            label: t("payouts.kpiPaid"),
            value: money(sum("net", paid)),
            sub: t("payouts.kpiPaidSub", { n: paid.length }),
          },
          {
            label: t("payouts.kpiWaiting"),
            value: money(sum("net", waiting)),
            sub: t("payouts.kpiWaitingSub", { n: waiting.length }),
          },
        ]}
      />
      <p className="note">
        <b>{t("payouts.moneyTitle")}</b> {t("payouts.moneyText")}
      </p>
      <section className="block" aria-labelledby="payouts-h">
        <BlockHead
          id="payouts-h"
          title={t("payouts.title", {
            from: formatDay(period?.period_from ?? "", locale),
            to: formatDay(period?.period_to ?? "", locale),
          })}
          about={t("payouts.about")}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("payouts.payee")}</Th>
                <Th className="text-right">{t("payouts.gross")}</Th>
                <Th className="text-right">{t("payouts.withheld")}</Th>
                <Th className="text-right">{t("payouts.net")}</Th>
                <Th>{t("payouts.mode")}</Th>
                <Th>{t("payouts.state")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {payouts.data.map((p) => {
                const isOpen = open === p.id;
                return [
                  <tr key={p.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <OpenLink
                          open={isOpen}
                          href={hrefWith(
                            "/marketing/affiliate/payouts",
                            {},
                            { open: p.id },
                            "#payouts-h",
                          )}
                          closeHref="/marketing/affiliate/payouts"
                        >
                          {p.partner_name}
                        </OpenLink>
                        <span className="sub">{t(`taxSubject.${p.tax_subject}`)}</span>
                      </span>
                    </Td>
                    <Td label={t("payouts.gross")} className="text-right num">
                      {money(p.gross.amount)}
                    </Td>
                    <Td label={t("payouts.withheld")} className="text-right num">
                      {Number(p.withheld.amount) > 0 ? `−${money(p.withheld.amount)}` : money(0)}
                    </Td>
                    <Td label={t("payouts.net")} className="text-right num">
                      {money(p.net.amount)}
                    </Td>
                    <Td label={t("payouts.mode")}>{t(`program.modes.${p.mode}`)}</Td>
                    <Td label={t("payouts.state")}>
                      <Status tone={TONE[p.status]}>{t(`payoutState.${p.status}`)}</Status>
                    </Td>
                    <Td className="rt-acts">
                      {finance && p.status === "building" && p.mode === "manual" ? (
                        <MarkPaidDialog
                          id={p.id}
                          name={p.partner_name}
                          gross={p.gross.amount}
                          withheld={p.withheld.amount}
                          net={p.net.amount}
                        />
                      ) : null}
                      {finance && p.status === "failed" ? (
                        <MoneyConfirm
                          action={retryPayoutAction}
                          fields={{ id: p.id }}
                          label={t("payouts.retry")}
                          title={t("payouts.retryTitle", { name: p.partner_name })}
                          rows={[
                            [t("payouts.net"), money(p.net.amount)],
                            [t("payouts.reference"), p.reference],
                            [t("payouts.via"), t("payouts.viaGateway")],
                          ]}
                          warn={t("payouts.retryWarn")}
                          submit={t("payouts.retrySubmit")}
                          done={t("payouts.retried")}
                        />
                      ) : null}
                    </Td>
                  </tr>,
                  isOpen ? (
                    <DetailRow key={`${p.id}-open`} cols={7}>
                      <h3 className="h2">{t("payouts.snapshot")}</h3>
                      <Lines
                        total
                        items={[
                          [t("payouts.carried"), money(p.carried.amount)],
                          [
                            t("payouts.lines", { n: p.commission_count }),
                            money(p.commissions_total.amount),
                          ],
                          [t("payouts.adjustments"), money(p.adjustments_total.amount)],
                          [
                            p.withholding.rate_bp > 0
                              ? t("payouts.pit", {
                                  pct: p.withholding.rate_bp / 100,
                                  threshold: p.withholding.threshold
                                    ? money(p.withholding.threshold.amount)
                                    : "—",
                                })
                              : t("payouts.noPit"),
                            Number(p.withheld.amount) > 0
                              ? `−${money(p.withheld.amount)}`
                              : money(0),
                          ],
                          [t("payouts.net"), money(p.net.amount)],
                        ]}
                      />
                      <KV
                        items={[
                          [t("payouts.basis"), p.withholding.basis],
                          [
                            t("payouts.reference"),
                            <span key="r" className="mono">
                              {p.reference}
                            </span>,
                          ],
                          p.bank_reference_set
                            ? [t("payouts.bankRef"), t("payouts.recorded")]
                            : null,
                          p.invoice_number_set
                            ? [t("payouts.invoice"), t("payouts.recorded")]
                            : null,
                          p.error
                            ? [t("payouts.error"), t(`codes.${p.error.replaceAll(".", "_")}`)]
                            : null,
                          p.sent_at
                            ? [t("payouts.sentAt"), <Time key="s" value={p.sent_at} />]
                            : null,
                          p.paid_at
                            ? [t("payouts.paidAt"), <Time key="p" value={p.paid_at} />]
                            : null,
                          p.certificate_issued_at
                            ? [
                                t("payouts.certificate"),
                                <Time key="c" value={p.certificate_issued_at} />,
                              ]
                            : null,
                        ]}
                      />
                      <p className="fhint">{t("payouts.snapshotNote")}</p>
                    </DetailRow>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">
          {t("payouts.foot", {
            gross: money(sum("gross")),
            withheld: money(sum("withheld")),
            net: money(sum("net")),
          })}
        </p>
      </section>
      <section className="block" aria-labelledby="pit-h">
        <BlockHead id="pit-h" title={t("payouts.pitTitle")} about={t("payouts.pitAbout")} />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("payouts.payee")}</Th>
                <Th>{t("payouts.withholdRule")}</Th>
                <Th>{t("payouts.basis")}</Th>
              </tr>
            </thead>
            <tbody>
              {pit.data.map((r) => (
                <tr key={r.id}>
                  <Td className="rt-title">{t(`pitSubject.${r.subject}`)}</Td>
                  <Td label={t("payouts.withholdRule")}>
                    {r.rate_bp === 0
                      ? t("payouts.none")
                      : r.threshold
                        ? t("payouts.rateFrom", {
                            pct: r.rate_bp / 100,
                            threshold: money(r.threshold.amount),
                          })
                        : t("payouts.rateAll", { pct: r.rate_bp / 100 })}
                  </Td>
                  <Td label={t("payouts.basis")}>
                    <Cell2 main={r.basis} sub={r.verify ? t("payouts.verify") : undefined} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="gr-legal">
          {t("payouts.pitLegal", { n: formatCount(pit.data.length, locale) })}
        </p>
      </section>
    </div>
  );
}
