import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ReferralRuleDialog } from "@/components/customers/forms";
import { Chips } from "@/components/engage/common";
import { BlockHead, Cell2, hrefWith, param, Status, Tiles } from "@/components/growth/blocks";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { CUSTOMERS_ENGAGEMENT_MANAGE } from "@/lib/customers";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import {
  listReferralRules,
  listReferrals,
  type ReferralStatus,
  ruleState,
} from "@/sample/customers";
import { CUSTOMER_TABS } from "../shared";

const CHIPS: readonly ReferralStatus[] = ["pending", "qualified", "rewarded", "rejected"];
const TONE: Record<ReferralStatus, string> = {
  pending: "b-info",
  qualified: "b-violet",
  rewarded: "b-ok",
  rejected: "b-bad",
};

// Tab "Giới thiệu bạn": mỗi khách một mã; người được giới thiệu nhập mã trong 14 ngày sau khi tạo tài khoản
// và trước đơn đầu; thưởng (điểm) khi đơn đầu hoàn tất và đủ giá trị tối thiểu. Trạng thái tính từ đơn đầu
// thật của bộ mẫu. Cùng SĐT / email / thiết bị với người giới thiệu thì bị loại.
export default async function ReferralsPage(props: PageProps<"/customers/referrals">) {
  // Tab dữ liệu mẫu (bước 47): tắt dữ liệu mẫu thì không có.
  if (!sampleDataEnabled()) notFound();
  if (!(await can(CUSTOMER_TABS.referrals))) notFound();
  const [t, locale, params, referrals, rules, manage] = await Promise.all([
    getTranslations("customers"),
    getLocale(),
    props.searchParams,
    listReferrals(),
    listReferralRules(),
    can(CUSTOMERS_ENGAGEMENT_MANAGE),
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const rows = referrals.data.filter((r) => !chip || r.status === chip);
  const current = rules.data.find((r) => ruleState(r.effective_from, r.effective_to) === "active");
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="referrals-h">
        <BlockHead id="referrals-h" title={t("referrals.title")} about={t("referrals.about")} />
        <Chips
          label={t("referrals.filter")}
          chips={[
            {
              href: "/customers/referrals",
              label: t("referrals.all"),
              on: !chip,
              count: referrals.data.length,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/customers/referrals", {}, { chip: c }),
              label: t(`referrals.states.${c}`),
              on: chip === c,
              count: referrals.data.filter((r) => r.status === c).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("referrals.referrer")}</Th>
                <Th>{t("referrals.referee")}</Th>
                <Th>{t("referrals.firstOrder")}</Th>
                <Th>{t("referrals.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <Link href={`/customers?open=${r.referrer_id}#profiles-h`}>
                        {r.referrer_name}
                      </Link>
                      <span className="sub mono">{r.referrer_code}</span>
                    </span>
                  </Td>
                  <Td label={t("referrals.referee")}>
                    {r.referee_id ? (
                      <Link href={`/customers?open=${r.referee_id}#profiles-h`}>
                        {r.referee_name}
                      </Link>
                    ) : (
                      r.referee_name
                    )}
                  </Td>
                  <Td label={t("referrals.firstOrder")}>
                    {r.first_order ? (
                      <Cell2
                        main={
                          <Link className="mono" href={`/sales/orders/${r.first_order.id}`}>
                            {r.first_order.number}
                          </Link>
                        }
                        sub={`${t(`orderStatus.${r.first_order.status}`)} · ${money(r.first_order.total.amount)}`}
                      />
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td label={t("referrals.state")}>
                    <Status tone={TONE[r.status]}>{t(`referrals.states.${r.status}`)}</Status>
                    {r.reason ? <span className="sub"> {t("referrals.selfReferral")}</span> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("referrals.once")}</p>
      </section>
      <section className="block" aria-labelledby="rrules-h">
        <BlockHead
          id="rrules-h"
          title={t("referrals.rulesTitle")}
          about={t("referrals.rulesAbout")}
        />
        {current ? (
          <Tiles
            items={[
              {
                title: t("referrals.forReferrer"),
                big: t("referrals.points", { n: formatCount(current.referrer_points, locale) }),
                text: t("referrals.whenCompleted"),
                meta: t("referrals.since", { date: formatDay(current.effective_from, locale) }),
              },
              {
                title: t("referrals.forReferee"),
                big: t("referrals.points", { n: formatCount(current.referee_points, locale) }),
                text: t("referrals.minOrder", { amount: money(current.min_first_order.amount) }),
                meta: t("referrals.applyDays", { n: current.apply_days }),
              },
              {
                title: t("referrals.newRule"),
                text: t("referrals.newRuleText"),
                ...(manage ? { action: <ReferralRuleDialog /> } : {}),
              },
            ]}
          />
        ) : null}
        {rules.data.length > 1 ? (
          <p className="fhint">
            {rules.data
              .filter((r) => r !== current)
              .map((r) =>
                t("referrals.otherRule", {
                  from: formatDay(r.effective_from, locale),
                  a: r.referrer_points,
                  b: r.referee_points,
                  state: t(`ruleState.${ruleState(r.effective_from, r.effective_to)}`),
                }),
              )
              .join(" · ")}
          </p>
        ) : null}
        <p className="gr-legal">{t("referrals.legal")}</p>
      </section>
    </div>
  );
}
