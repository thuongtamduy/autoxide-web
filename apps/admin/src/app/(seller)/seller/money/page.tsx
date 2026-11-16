import { getLocale, getTranslations } from "next-intl/server";
import { Day } from "@/components/compliance/common";
import { Kpis, MoneyLines, SettlementRow } from "@/components/market/common";
import { SellerHead } from "@/components/market/seller";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { PAYOUT_BADGE, SETTLEMENT_BADGE } from "@/lib/market";
import { sellerContext } from "@/lib/seller";
import { listPayouts, listSettlements, moneyStats } from "@/sample/market";

// Đối soát và chi trả của người bán: tiền của đơn nằm ở tài khoản thu hộ của đối tác (không phải của
// sàn) tới hết hạn đổi trả; mỗi đợt chi trừ phí sàn và thuế khấu trừ thay, kèm chứng từ khấu trừ.
export default async function SellerMoney() {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const [t, tm, locale] = await Promise.all([
    getTranslations("seller"),
    getTranslations("market"),
    getLocale(),
  ]);
  const org = ctx.seller.org_id;
  const [{ data: stats }, { data: settlements }, { data: payouts }] = await Promise.all([
    moneyStats(org),
    listSettlements({ seller: org }),
    listPayouts({ seller: org }),
  ]);
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const next = payouts.find((p) => p.status === "building" || p.status === "failed");
  return (
    <div className="page mk-page">
      <SellerHead title={t("money.title")} description={t("money.description")} />
      <div className="blocks">
        <Kpis
          label={t("money.kpis")}
          items={[
            {
              label: t("money.kpiHeld"),
              value: money(stats.held.amount),
              sub: t("money.kpiHeldSub", { count: stats.held_orders }),
            },
            {
              label: t("money.kpiNext"),
              value: money(stats.building.amount),
              sub: t("money.kpiNextSub"),
            },
            {
              label: t("money.kpiPaid"),
              value: money(stats.paid_month.amount),
              sub: t("money.kpiPaidSub", { count: stats.paid_count }),
            },
          ]}
        />
        <p className="note">
          <b>{t("money.whereStrong")}</b> {t("money.whereText")}
        </p>
        {next ? (
          <section className="block card cp-pad" aria-labelledby="sl-next-h">
            <h2 id="sl-next-h" className="h2">
              {t("money.next")} · <Day value={next.period_from} /> – <Day value={next.period_to} />
            </h2>
            {next.status === "failed" && next.failure ? (
              <p className="note warn">
                {tm(`payouts.failure.${next.failure}`)} {t("money.failedHelp")}
              </p>
            ) : !next.seller_can_receive ? (
              <p className="note warn">{t("money.onHold")}</p>
            ) : null}
            <MoneyLines
              gross={next.gross}
              fees={next.fees}
              feeVat={next.fee_vat}
              vat={next.withholding_vat}
              pit={next.withholding_pit}
              net={next.amount}
              netLabel={tm("money.payout")}
            />
          </section>
        ) : null}
        <section className="block" aria-labelledby="sl-statement-h">
          <div className="block-head">
            <h2 id="sl-statement-h" className="h2">
              {t("money.statement")}
            </h2>
            <a className="btn sm" href="/seller/money/statement.csv" download>
              {t("money.csv")}
            </a>
          </div>
          <div className="card tcard">
            <Table cards>
              <thead>
                <tr>
                  <Th>{tm("money.order")}</Th>
                  <Th className="text-right">{tm("money.gross")}</Th>
                  <Th className="text-right">{tm("money.feeIncl")}</Th>
                  <Th className="text-right">{tm("money.withheld")}</Th>
                  <Th className="text-right">{tm("money.net")}</Th>
                  <Th>{tm("payouts.state")}</Th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <Td className="rt-title">
                      <span className="mono">{s.order_number}</span>
                    </Td>
                    <SettlementRow s={s} />
                    <Td label={tm("payouts.state")}>
                      <span className={SETTLEMENT_BADGE[s.status]}>
                        <span className="dot" />
                        {tm(`settlementStatus.${s.status}`)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <p className="fhint">{t("money.foot")}</p>
        </section>
        <section className="block" aria-labelledby="sl-payouts-h">
          <h2 id="sl-payouts-h" className="h2">
            {t("money.payouts")}
          </h2>
          <div className="card tcard">
            <Table cards>
              <thead>
                <tr>
                  <Th>{tm("payouts.period")}</Th>
                  <Th className="text-right">{tm("payouts.amount")}</Th>
                  <Th>{tm("payouts.certificate")}</Th>
                  <Th>{tm("payouts.state")}</Th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <span>
                          <Day value={p.period_from} /> – <Day value={p.period_to} />
                        </span>
                        <span className="sub">
                          {tm("payouts.orders", { count: p.order_count })}
                        </span>
                      </span>
                    </Td>
                    <Td label={tm("payouts.amount")} className="text-right num">
                      <b>{money(p.amount.amount)}</b>
                    </Td>
                    <Td label={tm("payouts.certificate")}>
                      <span className="mono">{p.withholding_certificate ?? "—"}</span>
                    </Td>
                    <Td label={tm("payouts.state")}>
                      <span className={PAYOUT_BADGE[p.status]}>
                        <span className="dot" />
                        {tm(`payoutStatus.${p.status}`)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
