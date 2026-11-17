import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createPlanAction } from "@/app/(platform)/platform/plan-actions";
import { Chips } from "@/components/engage/common";
import { PLAN_BADGE, StatusBadge } from "@/components/platform/common";
import { planFields } from "@/components/platform/plan-fields";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { oneOf, type SearchParams } from "@/lib/engage";
import { formatMoney } from "@/lib/format";
import { PLANS_MANAGE } from "@/lib/permissions";
import { loadAllPlans, loadAllSubscriptions, subscriberCounts } from "@/lib/plans-server";
import { can } from "@/lib/viewer";

const STATUSES = ["active", "draft", "retired"] as const;

// Tab "Gói" (`GET /plans/plans`, bước 35 của core): gói chính và gói thêm, lọc theo trạng thái, số khách
// đang dùng (đếm từ `GET /plans/subscriptions`). Không xoá gói đã có khách, chỉ ngừng bán.
export default async function PlansPage(props: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations("platform.plans");
  const tp = await getTranslations("platform");
  const locale = await getLocale();
  const status = oneOf(await props.searchParams, "status", STATUSES);
  const [all, subscriptions, manage] = await Promise.all([
    loadAllPlans(),
    loadAllSubscriptions(),
    can(PLANS_MANAGE),
  ]);
  const counts = subscriberCounts(subscriptions);
  const plans = all.filter((p) => !status || p.status === status);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="pf-plans-h">
        <div className="block-head">
          <h2 id="pf-plans-h" className="h2">
            {t("listTitle")}
          </h2>
          {manage ? (
            <FormDialog
              action={createPlanAction}
              label={t("create")}
              triggerClass="btn sm pri"
              title={t("createTitle")}
              intro={t("createIntro")}
              submit={t("createSubmit")}
              done={t("created")}
              fields={await planFields({}, true)}
            />
          ) : null}
        </div>
        <p className="fhint">{t("listAbout")}</p>
        <Chips
          label={t("filter")}
          chips={[
            { href: "/platform/plans", label: tp("all"), on: !status, count: all.length },
            ...STATUSES.map((s) => ({
              href: `/platform/plans?status=${s}`,
              label: tp(`planStatus.${s}`),
              on: s === status,
              count: all.filter((p) => p.status === s).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("colPlan")}</Th>
                <Th>{t("kind")}</Th>
                <Th>{t("modules")}</Th>
                <Th>{t("colPrice")}</Th>
                <Th className="r">{t("colTenants")}</Th>
                <Th>{t("colStatus")}</Th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <Link href={`/platform/plans/${plan.id}`} className="open">
                        {plan.name}
                      </Link>
                      <span className="sub mono">{plan.code}</span>
                    </span>
                  </Td>
                  <Td label={t("kind")}>
                    {t(`kinds.${plan.kind === "addon" ? "addon" : "base"}`)}
                    {plan.is_default ? <span className="sub"> · {t("default")}</span> : null}
                  </Td>
                  <Td label={t("modules")}>
                    <span className="cell2">
                      <span>{tp("tenants.modules", { count: plan.modules.length })}</span>
                      <span className="sub mono ell">{plan.modules.join(", ") || "—"}</span>
                    </span>
                  </Td>
                  <Td label={t("colPrice")}>
                    <span className="cell2">
                      {plan.prices
                        .filter((p) => p.active)
                        .map((p) => (
                          <span key={p.id}>
                            {tp("price", {
                              amount: formatMoney(p.amount.amount, p.amount.currency, locale),
                              interval: tp(`interval.${p.interval === "year" ? "year" : "month"}`),
                            })}
                          </span>
                        ))}
                      {plan.prices.every((p) => !p.active) ? (
                        <span className="muted">{t("noPrice")}</span>
                      ) : null}
                    </span>
                  </Td>
                  <Td label={t("colTenants")} className="r">
                    {counts.get(plan.id) ?? 0}
                  </Td>
                  <Td label={t("colStatus")}>
                    <StatusBadge
                      className={PLAN_BADGE[plan.status as (typeof STATUSES)[number]] ?? "badge"}
                      label={
                        tp.has(`planStatus.${plan.status}`)
                          ? tp(`planStatus.${plan.status}`)
                          : plan.status
                      }
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {plans.length === 0 ? <p className="empty">{t("none")}</p> : null}
        </div>
      </section>
    </div>
  );
}
