import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Day } from "@/components/compliance/common";
import { Chips, Forbidden } from "@/components/engage/common";
import { Kpis, MoneyLines, SettlementRow } from "@/components/market/common";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatMoney } from "@/lib/format";
import {
  MARKETPLACE_FINANCE_MANAGE,
  MARKETPLACE_FINANCE_READ,
  PAYOUT_BADGE,
  SETTLEMENT_BADGE,
} from "@/lib/market";
import { can } from "@/lib/viewer";
import { listPayouts, listSettlements, moneyStats, type PayoutStatus } from "@/sample/market";
import { listTaxRules, taxRuleOn } from "@/sample/tax";
import { retryPayoutAction, sendPayoutAction } from "../actions";
import { param } from "../shared";

const FILTERS: PayoutStatus[] = ["building", "sent", "paid", "failed"];

// Tab "Chi trả": tiền của người mua nằm ở tài khoản thu hộ của đối tác có giấy phép; sàn giữ phần của
// người bán tới hết hạn đổi trả rồi gửi lệnh chi qua đối tác, sau khi trừ phí và thuế khấu trừ thay.
// Sàn không giữ tiền (D-187). Lệnh chi lại dùng cùng mã tham chiếu để đối tác không chi trùng.
export default async function PayoutsTab(props: PageProps<"/market/payouts">) {
  if (!(await can(MARKETPLACE_FINANCE_READ))) {
    return <Forbidden permission={MARKETPLACE_FINANCE_READ} />;
  }
  const [t, locale, params] = await Promise.all([
    getTranslations("market"),
    getLocale(),
    props.searchParams,
  ]);
  const status = FILTERS.find((s) => s === param(params, "status"));
  const open = param(params, "open");
  const [
    { data: payouts },
    { data: all },
    { data: stats },
    { data: settlements },
    manage,
    { data: rules },
  ] = await Promise.all([
    listPayouts(status ? { status } : {}),
    listPayouts(),
    moneyStats(),
    listSettlements(),
    can(MARKETPLACE_FINANCE_MANAGE),
    listTaxRules(),
  ]);
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const custody = taxRuleOn(rules, "payments.no_custody");
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: status ?? "", ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/market/payouts?${query}` : "/market/payouts";
  };
  return (
    <div className="blocks">
      <Kpis
        label={t("payouts.kpis")}
        items={[
          {
            label: t("payouts.kpiHeld"),
            value: money(stats.held.amount),
            sub: t("payouts.kpiHeldSub", { count: stats.held_orders }),
          },
          {
            label: t("payouts.kpiBuilding"),
            value: money(stats.building.amount),
            sub: t("payouts.kpiBuildingSub", { count: stats.building_count }),
          },
          {
            label: t("payouts.kpiPaid"),
            value: money(stats.paid_month.amount),
            sub: t("payouts.kpiPaidSub", { count: stats.paid_count }),
          },
        ]}
      />
      <p className="note">
        <b>{t("payouts.custodyStrong")}</b> {t("payouts.custodyText")}
        {custody ? <> {t("payouts.custodyBasis", { basis: custody.legal_basis })}</> : null}
      </p>

      <section className="block" aria-labelledby="mk-payouts-h">
        <h2 id="mk-payouts-h" className="h2">
          {t("payouts.title")}
        </h2>
        <Chips
          label={t("payouts.filter")}
          chips={[
            {
              href: href({ status: null, open: null }),
              label: t("all"),
              on: !status,
              count: all.length,
            },
            ...FILTERS.map((s) => ({
              href: href({ status: s, open: null }),
              label: t(`payoutStatus.${s}`),
              on: status === s,
              count: all.filter((p) => p.status === s).length,
            })),
          ]}
        />
        <div className="card tcard">
          {payouts.length === 0 ? (
            <p className="empty">{t("payouts.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("payouts.seller")}</Th>
                  <Th>{t("payouts.period")}</Th>
                  <Th className="text-right">{t("payouts.amount")}</Th>
                  <Th>{t("payouts.state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => {
                  const isOpen = open === p.id;
                  return [
                    <tr key={p.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={
                              isOpen ? href({ open: null }) : `${href({ open: p.id })}#mk-payouts-h`
                            }
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {p.seller_name}
                          </Link>
                          <span className="sub">
                            {t(`sellerType.${p.seller_type}`)} ·{" "}
                            {t("payouts.orders", { count: p.order_count })}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("payouts.period")}>
                        <Day value={p.period_from} /> – <Day value={p.period_to} />
                      </Td>
                      <Td label={t("payouts.amount")} className="text-right num">
                        <b>{money(p.amount.amount)}</b>
                      </Td>
                      <Td label={t("payouts.state")}>
                        <span className="cell2">
                          <span className={PAYOUT_BADGE[p.status]}>
                            <span className="dot" />
                            {t(`payoutStatus.${p.status}`)}
                          </span>
                          {p.status === "building" && !p.seller_can_receive ? (
                            <span className="sub tone-warn">{t("payouts.onHold")}</span>
                          ) : p.failure ? (
                            <span className="sub tone-bad">
                              {t(`payouts.failure.${p.failure}`)}
                            </span>
                          ) : null}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        {manage && p.status === "building" ? (
                          <ConfirmAction
                            action={sendPayoutAction}
                            id={p.id}
                            label={t("payouts.send")}
                            title={t("payouts.sendTitle", {
                              amount: money(p.amount.amount),
                              name: p.seller_name,
                            })}
                            points={[
                              t("payouts.sendPoint1"),
                              t("payouts.sendPoint2"),
                              t("payouts.sendPoint3"),
                            ]}
                            submit={t("payouts.send")}
                            done={t("payouts.sent")}
                            danger={false}
                          />
                        ) : manage && p.status === "failed" ? (
                          <ConfirmAction
                            action={retryPayoutAction}
                            id={p.id}
                            label={t("payouts.retry")}
                            title={t("payouts.retryTitle", {
                              amount: money(p.amount.amount),
                              name: p.seller_name,
                            })}
                            points={[t("payouts.retryPoint1"), t("payouts.retryPoint2")]}
                            submit={t("payouts.retry")}
                            done={t("payouts.sent")}
                            danger={false}
                          />
                        ) : null}
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${p.id}-open`} className="cat-detail-row">
                        <td colSpan={5}>
                          <div className="cat-detail">
                            <h3 className="h2">
                              {t("payouts.statement", { name: p.seller_name })}
                            </h3>
                            <MoneyLines
                              gross={p.gross}
                              fees={p.fees}
                              feeVat={p.fee_vat}
                              vat={p.withholding_vat}
                              pit={p.withholding_pit}
                              net={p.amount}
                              netLabel={t("money.payout")}
                            />
                            <dl className="eg-facts">
                              <div>
                                <dt>{t("payouts.reference")}</dt>
                                <dd className="mono">{p.reference}</dd>
                              </div>
                              <div>
                                <dt>{t("payouts.attempts")}</dt>
                                <dd>{p.attempts}</dd>
                              </div>
                              {p.paid_at ? (
                                <div>
                                  <dt>{t("payouts.paidAt")}</dt>
                                  <dd>
                                    <Time value={p.paid_at} />
                                  </dd>
                                </div>
                              ) : null}
                              {p.withholding_certificate ? (
                                <div>
                                  <dt>{t("payouts.certificate")}</dt>
                                  <dd className="mono">{p.withholding_certificate}</dd>
                                </div>
                              ) : null}
                            </dl>
                            <p className="fhint">{t("payouts.note")}</p>
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

      <section className="block" aria-labelledby="mk-settlements-h">
        <h2 id="mk-settlements-h" className="h2">
          {t("payouts.settlements")}
        </h2>
        <p className="fhint">{t("payouts.settlementsAbout")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("money.order")}</Th>
                <Th className="text-right">{t("money.gross")}</Th>
                <Th className="text-right">{t("money.feeIncl")}</Th>
                <Th className="text-right">{t("money.withheld")}</Th>
                <Th className="text-right">{t("money.net")}</Th>
                <Th>{t("payouts.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <span className="mono">{s.order_number}</span>
                      <span className="sub">{s.seller_name}</span>
                    </span>
                  </Td>
                  <SettlementRow s={s} />
                  <Td label={t("payouts.state")}>
                    <span className={SETTLEMENT_BADGE[s.status]}>
                      <span className="dot" />
                      {t(`settlementStatus.${s.status}`)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("payouts.ledgerNote")}</p>
      </section>
    </div>
  );
}
