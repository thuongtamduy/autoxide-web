import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createPlanAction, updatePlanAction } from "@/app/(platform)/platform/plan-actions";
import { Chips } from "@/components/engage/common";
import { PLAN_BADGE, StatusBadge } from "@/components/platform/common";
import { planFields } from "@/components/platform/plan-fields";
import { EmptyState } from "@/components/ui/empty-state";
import { FormDialog } from "@/components/ui/form-dialog";
import { oneOf, type SearchParams } from "@/lib/engage";
import { formatBytes, formatCount, formatMoney } from "@/lib/format";
import { PLANS_MANAGE } from "@/lib/permissions";
import { isBytes, limitsText, type Plan } from "@/lib/plans";
import { loadAllPlans, loadAllSubscriptions, subscriberCounts } from "@/lib/plans-server";
import { can } from "@/lib/viewer";

const STATUSES = ["active", "draft", "retired"] as const;
/** Số module, hạn mức hiện trên thẻ; phần còn lại gộp thành "+N" (đủ ở trang chi tiết). */
const SHOWN_MODULES = 6;
const SHOWN_LIMITS = 4;

// Tab "Gói" (`GET /plans/plans`, bước 35 của core): mỗi gói một thẻ cạnh nhau như trang giá của Stripe,
// Vercel — tên, trạng thái, giá đang bán, module, hạn mức, số khách đang dùng (đếm từ
// `GET /plans/subscriptions`), nút sửa (cùng hộp thoại và Server Action như trang chi tiết). Lọc theo
// trạng thái. Không xoá gói đã có khách, chỉ ngừng bán.
export default async function PlansPage(props: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations("platform.plans");
  const tp = await getTranslations("platform");
  const tm = await getTranslations("modules");
  const locale = await getLocale();
  const status = oneOf(await props.searchParams, "status", STATUSES);
  const [all, subscriptions, manage] = await Promise.all([
    loadAllPlans(),
    loadAllSubscriptions(),
    can(PLANS_MANAGE),
  ]);
  const counts = subscriberCounts(subscriptions);
  const plans = all.filter((p) => !status || p.status === status);
  const moduleName = (m: string) => (tm.has(`names.${m}`) ? tm(`names.${m}`) : m);
  const limitLabel = (key: string) =>
    tp.has(`limits.${key.replaceAll(".", "_")}`) ? tp(`limits.${key.replaceAll(".", "_")}`) : key;
  const limitValue = (key: string, max: number | null) =>
    max === null
      ? tp("unlimited")
      : isBytes(key)
        ? formatBytes(max, locale)
        : formatCount(max, locale);
  const editDialog = async (plan: Plan) => (
    <FormDialog
      action={updatePlanAction}
      label={t("editShort")}
      title={t("editTitle", { plan: plan.name })}
      intro={t("editIntro")}
      submit={t("editSubmit")}
      done={t("edited")}
      fields={[
        { kind: "hidden", name: "plan_id", value: plan.id },
        ...(await planFields(
          {
            name: plan.name,
            description: plan.description,
            modules: plan.modules.join(", "),
            features: plan.features.join(", "),
            limits: limitsText(plan.limits as Record<string, number | null>),
            trial_days: String(plan.trial_days),
            placement: plan.placement,
          },
          false,
        )),
      ]}
    />
  );
  const cards = await Promise.all(
    plans.map(async (plan) => {
      const prices = plan.prices.filter((p) => p.active);
      const [main, ...more] = prices;
      const limits = Object.entries(plan.limits as Record<string, number | null>);
      const planStatus = STATUSES.find((s) => s === plan.status) ?? "draft";
      const tenants = counts.get(plan.id) ?? 0;
      return (
        <li key={plan.id} className="card pf-pcard" data-plan={plan.code}>
          <div className="pf-pcard-head">
            <Link href={`/platform/plans/${plan.id}`} className="pf-pcard-name">
              {plan.name}
            </Link>
            <StatusBadge
              className={PLAN_BADGE[planStatus]}
              label={
                tp.has(`planStatus.${plan.status}`) ? tp(`planStatus.${plan.status}`) : plan.status
              }
            />
          </div>
          <span className="pf-pcard-kind">
            {t(`kinds.${plan.kind === "addon" ? "addon" : "base"}`)}
            {plan.is_default ? ` · ${t("default")}` : ""} ·{" "}
            <span className="mono">{plan.code}</span>
          </span>
          <div className="pf-pcard-price">
            {main ? (
              <>
                <b>{formatMoney(main.amount.amount, main.amount.currency, locale)}</b>
                <span>/ {tp(`interval.${main.interval === "year" ? "year" : "month"}`)}</span>
              </>
            ) : (
              <span className="muted">{t("noPrice")}</span>
            )}
          </div>
          {more.length > 0 ? (
            <span className="pf-pcard-sub">
              {more
                .map((p) =>
                  tp("price", {
                    amount: formatMoney(p.amount.amount, p.amount.currency, locale),
                    interval: tp(`interval.${p.interval === "year" ? "year" : "month"}`),
                  }),
                )
                .join(" · ")}
            </span>
          ) : null}
          {plan.description ? <p className="pf-pcard-about">{plan.description}</p> : null}
          <p className="pf-pcard-tenants">
            <b>{formatCount(tenants, locale)}</b> {t("tenantsUsing", { count: tenants })}
            {plan.trial_days > 0 ? ` · ${t("trialDays", { count: plan.trial_days })}` : ""}
          </p>
          <div className="pf-pcard-sec">
            <span className="pf-pcard-label">{t("modules")}</span>
            {plan.modules.length === 0 ? (
              <span className="pf-pcard-sub">{t("noModules")}</span>
            ) : (
              <ul className="pf-pcard-mods">
                {plan.modules.slice(0, SHOWN_MODULES).map((m) => (
                  <li key={m} className="tag" title={m}>
                    {moduleName(m)}
                  </li>
                ))}
                {plan.modules.length > SHOWN_MODULES ? (
                  <li className="tag">+{plan.modules.length - SHOWN_MODULES}</li>
                ) : null}
              </ul>
            )}
          </div>
          <div className="pf-pcard-sec">
            <span className="pf-pcard-label">{t("limits")}</span>
            {limits.length === 0 ? (
              <span className="pf-pcard-sub">{t("noLimitsShort")}</span>
            ) : (
              <ul className="pf-pcard-limits">
                {limits.slice(0, SHOWN_LIMITS).map(([key, max]) => (
                  <li key={key}>
                    <span>{limitLabel(key)}</span>
                    <b className="num">{limitValue(key, max)}</b>
                  </li>
                ))}
                {limits.length > SHOWN_LIMITS ? (
                  <li className="pf-pcard-sub">
                    {t("moreLimits", { count: limits.length - SHOWN_LIMITS })}
                  </li>
                ) : null}
              </ul>
            )}
          </div>
          <div className="pf-pcard-foot">
            <Link className="btn sm" href={`/platform/plans/${plan.id}`}>
              {t("details")}
            </Link>
            {manage && plan.status !== "retired" ? await editDialog(plan) : null}
          </div>
        </li>
      );
    }),
  );
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
        {plans.length === 0 ? (
          <div className="card">
            <EmptyState icon="card" title={status ? t("none") : t("noneYet")}>
              {status ? null : t("noneYetText")}
            </EmptyState>
          </div>
        ) : (
          <ul className="pf-pcards">{cards}</ul>
        )}
      </section>
    </div>
  );
}
