import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LoyaltyRuleDialog } from "@/components/customers/forms";
import { BlockHead, Cell2, Kpis, Status, Tiles } from "@/components/growth/blocks";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { CUSTOMERS_LOYALTY_MANAGE } from "@/lib/customers";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { listLoyaltyRules, loyaltyStats, ruleState } from "@/sample/customers";
import { CUSTOMER_TABS } from "../shared";

const STATE_TONE = { active: "b-ok", scheduled: "b-sched", closed: "b-arch" } as const;
const TIER_TONE = { member: "b-arch", silver: "b-info", gold: "b-warn" } as const;

// Tab "Điểm và hạng": điểm chưa dùng là nghĩa vụ trong sổ cái (điểm × giá trị lúc tích); quy tắc là dữ liệu
// có ngày hiệu lực, chỉ thêm. Thưởng điểm khi đánh giá không phụ thuộc số sao (đánh giá có điều kiện).
export default async function LoyaltyPage() {
  if (!(await can(CUSTOMER_TABS.loyalty))) notFound();
  const [t, locale, stats, rules, manage] = await Promise.all([
    getTranslations("customers"),
    getLocale(),
    loyaltyStats(),
    listLoyaltyRules(),
    can(CUSTOMERS_LOYALTY_MANAGE),
  ]);
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const day = (iso: string) => formatDay(iso, locale);
  return (
    <div className="blocks">
      <Kpis
        label={t("loyalty.kpis")}
        items={[
          {
            label: t("loyalty.kpiPoints"),
            value: formatCount(stats.outstanding_points, locale),
            sub: t("loyalty.kpiPointsSub", { n: formatCount(stats.holders, locale) }),
          },
          {
            label: t("loyalty.kpiLiability"),
            value: money(stats.liability.amount),
            sub: t("loyalty.kpiLiabilitySub"),
          },
          {
            label: t("loyalty.kpiExpiring"),
            value: formatCount(stats.expiring_30d, locale),
            sub: t("loyalty.kpiExpiringSub"),
          },
          {
            label: t("loyalty.kpiHeld"),
            value: formatCount(stats.held, locale),
            sub: t("loyalty.kpiHeldSub"),
          },
        ]}
      />
      <section className="block" aria-labelledby="lrules-h">
        <BlockHead
          id="lrules-h"
          title={t("loyalty.rulesTitle")}
          about={t("loyalty.rulesAbout")}
          actions={manage ? <LoyaltyRuleDialog /> : null}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("loyalty.earn")}</Th>
                <Th className="text-right">{t("loyalty.pointValue")}</Th>
                <Th>{t("loyalty.redeem")}</Th>
                <Th>{t("loyalty.effective")}</Th>
                <Th>{t("loyalty.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {rules.data.map((r) => {
                const state = ruleState(r.effective_from, r.effective_to);
                return (
                  <tr key={r.id}>
                    <Td className="rt-title">
                      <Cell2
                        main={t("loyalty.earnRule", { amount: money(r.earn_per_minor) })}
                        sub={t("loyalty.validMonths", { n: r.points_valid_months })}
                      />
                    </Td>
                    <Td label={t("loyalty.pointValue")} className="text-right num">
                      {money(r.point_value_minor)}
                    </Td>
                    <Td label={t("loyalty.redeem")}>
                      <Cell2
                        main={t("loyalty.minRedeem", { n: r.min_redeem_points })}
                        sub={t("loyalty.maxRatio", { pct: r.max_redeem_ratio_bp / 100 })}
                      />
                    </Td>
                    <Td label={t("loyalty.effective")}>
                      {day(r.effective_from)}
                      {r.effective_to ? <> – {day(r.effective_to)}</> : null}
                    </Td>
                    <Td label={t("loyalty.state")}>
                      <Status tone={STATE_TONE[state]}>{t(`ruleState.${state}`)}</Status>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="gr-legal">{t("loyalty.rulesLegal")}</p>
      </section>
      <section className="block half" aria-labelledby="tiers-h">
        <BlockHead id="tiers-h" title={t("loyalty.tiersTitle")} about={t("loyalty.tiersAbout")} />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("loyalty.tier")}</Th>
                <Th className="text-right">{t("loyalty.threshold")}</Th>
                <Th className="text-right">{t("loyalty.multiplier")}</Th>
                <Th className="text-right">{t("loyalty.customers")}</Th>
              </tr>
            </thead>
            <tbody>
              {stats.tiers.map((tier) => (
                <tr key={tier.code}>
                  <Td className="rt-title">
                    <Status tone={TIER_TONE[tier.code]}>{t(`tiers.${tier.code}`)}</Status>
                  </Td>
                  <Td label={t("loyalty.threshold")} className="text-right num">
                    {money(tier.threshold.amount)}
                  </Td>
                  <Td label={t("loyalty.multiplier")} className="text-right num">
                    × {new Intl.NumberFormat(locale).format(tier.earn_multiplier_bp / 10_000)}
                  </Td>
                  <Td label={t("loyalty.customers")} className="text-right num">
                    {formatCount(tier.count, locale)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
      <section className="block half" aria-labelledby="adjust-h">
        <BlockHead
          id="adjust-h"
          title={t("loyalty.adjustTitle")}
          about={t("loyalty.adjustAbout")}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("loyalty.customer")}</Th>
                <Th className="text-right">{t("loyalty.pointsCol")}</Th>
                <Th>{t("loyalty.reason")}</Th>
              </tr>
            </thead>
            <tbody>
              {stats.adjustments.map((a) => (
                <tr key={a.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <Link href={`/customers?open=${a.profile_id}#profiles-h`}>
                        {a.profile_name}
                      </Link>
                      <span className="sub">
                        <span className="mono">{a.reference}</span> · {a.actor?.name}
                      </span>
                    </span>
                  </Td>
                  <Td
                    label={t("loyalty.pointsCol")}
                    className={a.points < 0 ? "text-right num cat-neg" : "text-right num cat-pos"}
                  >
                    {a.points > 0 ? "+" : "−"}
                    {formatCount(Math.abs(a.points), locale)}
                  </Td>
                  <Td label={t("loyalty.reason")}>{a.reason}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
      <section className="block" aria-labelledby="review-h">
        <BlockHead
          id="review-h"
          title={t("loyalty.reviewTitle")}
          about={t("loyalty.reviewAbout")}
        />
        <Tiles
          items={[
            {
              title: t("loyalty.reviewReward"),
              big: t("loyalty.reviewPoints", { n: stats.review.points }),
              text: t("loyalty.reviewAny"),
              meta: t("loyalty.reviewFrom", {
                date: formatDay(stats.review.effective_from, locale),
              }),
            },
            {
              title: t("loyalty.reviewDone"),
              big: formatCount(stats.review.rewarded, locale),
              text: t("loyalty.reviewLow", { n: stats.review.low_star_rewarded }),
              meta: t("loyalty.reviewVerified"),
            },
          ]}
        />
        <p className="gr-legal">{t("loyalty.reviewLegal")}</p>
      </section>
      <p className="note">
        <b>{t("loyalty.storedTitle")}</b> {t("loyalty.storedText")}
      </p>
    </div>
  );
}
