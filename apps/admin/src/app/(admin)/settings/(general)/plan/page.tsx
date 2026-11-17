import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { SampleBadge } from "@/components/sample-badge";
import { ChangePlanDialog } from "@/components/settings/plan-forms";
import { BillingProfileForm } from "@/components/settings/sample-forms";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { formatBytes, formatCount, formatMoney } from "@/lib/format";
import { BILLING_MANAGE, BILLING_READ } from "@/lib/permissions";
import {
  type BillingPeriod,
  isBytes,
  type LimitUse,
  priceChoices,
  tightest,
  usagePercent,
} from "@/lib/plans";
import { loadOwnSubscription } from "@/lib/plans-server";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { SAMPLE_PROVINCES } from "@/sample/org";
import { getBillingProfile } from "@/sample/settings";
import { cancelRenewal, resumeRenewal } from "../../plan-actions";

const STATUSES = ["open", "paid", "void"] as const;
type PeriodStatus = (typeof STATUSES)[number];
const BADGE: Record<string, string> = {
  open: "badge b-warn",
  paid: "badge b-ok",
  void: "badge b-arch",
};

// Tab "Gói và thuê bao" (module `plans` của core, bước 35): gói đang dùng, mức dùng hạn mức, kỳ thanh
// toán, đổi gói, huỷ / tiếp tục gia hạn. Tiền thuê bao đi qua cổng của nhà vận hành. Hồ sơ xuất hoá
// đơn chưa có API (dữ liệu mẫu, có nhãn).
export default async function PlanPage(props: PageProps<"/settings/plan">) {
  const t = await getTranslations("settings.plan");
  if (!(await can(BILLING_READ))) {
    const errors = await getTranslations("errors");
    return (
      <MessagePanel
        title={errors("forbiddenTitle")}
        message={errors("forbidden", { permission: BILLING_READ })}
      />
    );
  }
  const locale = await getLocale();
  const { status } = await props.searchParams;
  const current = STATUSES.find((s) => s === status);
  const [sub, limits, all, catalog, manage] = await Promise.all([
    loadOwnSubscription(),
    load((c) => c.GET("/api/v1/plans/usage")).then((r) => r.data),
    load((c) => c.GET("/api/v1/plans/billing-periods")).then((r) => r.data),
    load((c) => c.GET("/api/v1/plans/catalog")).then((r) => r.data),
    can(BILLING_MANAGE),
  ]);
  const sample = sampleDataEnabled();
  const profile = sample ? (await getBillingProfile()).data : null;
  const money = (amount: { amount: string; currency: string }) =>
    formatMoney(amount.amount, amount.currency, locale);
  const planName = (id: string | null | undefined) =>
    catalog.find((plan) => plan.id === id)?.name ?? (id ? id.slice(0, 8) : "—");
  const priceOf = (id: string | null | undefined) =>
    catalog.flatMap((plan) => plan.prices).find((price) => price.id === id);
  const due = all.filter((p) => p.status === "open");
  const dueCurrency = due[0]?.amount.currency ?? "VND";
  const dueTotal = due.reduce((sum, p) => sum + Number(p.amount.amount), 0);
  const periods: BillingPeriod[] = current ? all.filter((p) => p.status === current) : all;
  const closest = tightest(limits);
  const label = (key: string) => {
    const id = `limits.${key.replaceAll(".", "_")}`;
    return t.has(id) ? t(id) : key;
  };
  const amount = (limit: LimitUse) => {
    const fmt = (n: number) =>
      isBytes(limit.key) ? formatBytes(n, locale) : formatCount(n, locale);
    return `${fmt(limit.used)} / ${limit.max === null || limit.max === undefined ? t("unlimited") : fmt(limit.max)}`;
  };
  const statusLabel = (value: string) => (t.has(`status.${value}`) ? t(`status.${value}`) : value);
  const options = priceChoices(catalog).map(({ value, plan, price }) => ({
    value,
    label: `${plan.name} · ${money(price.amount)} / ${t(`interval.${price.interval === "year" ? "year" : "month"}`)}`,
  }));
  const price = priceOf(sub?.price_id);
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, all.filter((p) => p.status === s).length]),
  ) as Record<PeriodStatus, number>;

  return (
    <div className="blocks">
      <section className="block" aria-labelledby="plan-h">
        <div className="block-head">
          <h2 id="plan-h" className="h2">
            {t("title")}
          </h2>
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("kpiPlan")}</span>
            <b className="kpi-value" data-testid="plan-name">
              {sub ? planName(sub.plan_id) : t("noPlan")}
            </b>
            {sub ? (
              <span className="kpi-sub">
                {sub.cancel_at_period_end ? t("endsOn") : t("renewsOn")}{" "}
                <Time value={sub.current_period_end} date />
              </span>
            ) : null}
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("kpiStatus")}</span>
            <b className="kpi-value">{sub ? statusLabel(sub.status) : "—"}</b>
            {sub ? (
              <span className="kpi-sub">
                {sub.cancel_at_period_end ? t("renewalOff") : t("renewalOn")}
              </span>
            ) : null}
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("kpiDue")}</span>
            <b className="kpi-value">
              {money({ amount: String(dueTotal), currency: dueCurrency })}
            </b>
            <span className="kpi-sub">{t("dueCount", { count: due.length })}</span>
          </div>
          {closest ? (
            <div className="card kpi">
              <span className="kpi-label">{t("kpiLimit")}</span>
              <b className="kpi-value">{usagePercent(closest)}%</b>
              <span className="kpi-sub">
                {label(closest.key)} {amount(closest)}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="block half" aria-labelledby="sub-h">
        <h3 id="sub-h" className="h2">
          {t("current")}
        </h3>
        <div className="card">
          {sub ? (
            <div className="item">
              <div className="item-main">
                <span className="item-title">
                  {planName(sub.plan_id)} · {t("basePlan")}
                </span>
                <span className="item-meta">
                  {price ? (
                    <>
                      {money(price.amount)} /{" "}
                      {t(`interval.${price.interval === "year" ? "year" : "month"}`)} ·{" "}
                    </>
                  ) : null}
                  <Time value={sub.current_period_start} date /> –{" "}
                  <Time value={sub.current_period_end} date />
                </span>
                {sub.trial_ends_at && sub.status === "trialing" ? (
                  <span className="item-meta">
                    {t("trialUntil")} <Time value={sub.trial_ends_at} date />
                  </span>
                ) : null}
                {sub.scheduled_plan_id ? (
                  <span className="item-meta">
                    {t("scheduled", { plan: planName(sub.scheduled_plan_id) })}
                  </span>
                ) : null}
                {sub.grace_ends_at && sub.status === "past_due" ? (
                  <span className="item-meta">
                    {t("graceUntil")} <Time value={sub.grace_ends_at} date />
                  </span>
                ) : null}
              </div>
              <span className={sub.cancel_at_period_end ? "badge b-warn" : "badge b-ok"}>
                <span className="dot" />
                {sub.cancel_at_period_end ? t("ending") : statusLabel(sub.status)}
              </span>
              {manage && sub.status !== "canceled" && sub.status !== "deleted" ? (
                <span className="item-acts">
                  {options.length > 0 ? (
                    <ChangePlanDialog
                      options={options}
                      current={`${sub.plan_id}|${sub.price_id ?? ""}`}
                    />
                  ) : null}
                  {sub.cancel_at_period_end ? (
                    <InlineAction
                      action={resumeRenewal}
                      id={sub.id}
                      label={t("resume")}
                      done={t("resumed")}
                    />
                  ) : (
                    <ConfirmAction
                      action={cancelRenewal}
                      id={sub.id}
                      label={t("cancel")}
                      title={t("cancelTitle")}
                      points={[t("cancelUntil"), t("cancelData"), t("cancelUndo")]}
                      submit={t("cancelSubmit")}
                      done={t("canceled")}
                    />
                  )}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="empty">{t("noSubscription")}</p>
          )}
          {sub?.addons.map((addon) => (
            <div className="item" key={addon.plan_id}>
              <div className="item-main">
                <span className="item-title">
                  {planName(addon.plan_id)} · {t("addon", { count: addon.quantity })}
                </span>
              </div>
              <span className="badge b-ok">
                <span className="dot" />
                {t("inUse")}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="block half" aria-labelledby="use-h">
        <h3 id="use-h" className="h2">
          {t("usage")}
        </h3>
        <div className="card padded meters" data-testid="limits">
          {limits.length === 0 ? <p className="empty">{t("noLimits")}</p> : null}
          {limits.map((limit) => (
            <div className="meter" key={limit.key}>
              <div className="meter-head">
                <span>{label(limit.key)}</span>
                <b>{amount(limit)}</b>
              </div>
              <progress
                className="bar"
                max={100}
                value={usagePercent(limit)}
                aria-label={label(limit.key)}
              />
              {limit.kind === "metered" ? <span className="fhint">{t("monthly")}</span> : null}
              {limit.over_limit ? <span className="ferr">{t("overLimit")}</span> : null}
            </div>
          ))}
        </div>
        <p className="fhint">{t("usageAbout")}</p>
      </section>

      <p className="note">{t("money")}</p>

      <section className="block" aria-labelledby="periods-h">
        <h3 id="periods-h" className="h2">
          {t("periods")}
        </h3>
        <nav className="chips" aria-label={t("filter")}>
          <Link
            className={current ? "chip" : "chip on"}
            href="/settings/plan"
            aria-current={current ? undefined : "page"}
          >
            {t("all")} <span className="cnt">{all.length}</span>
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              className={current === s ? "chip on" : "chip"}
              href={`/settings/plan?status=${s}`}
              aria-current={current === s ? "page" : undefined}
            >
              {t(`period.${s}`)} <span className="cnt">{counts[s]}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {periods.length === 0 ? (
            <p className="empty">{t("noPeriods")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("periodCol")}</Th>
                  <Th>{t("range")}</Th>
                  <Th className="text-right">{t("amount")}</Th>
                  <Th>{t("dueOrPaid")}</Th>
                  <Th>{t("state")}</Th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>
                          {t.has(`kind.${period.kind}`) ? t(`kind.${period.kind}`) : period.kind} ·{" "}
                          {planName(period.plan_id)}
                        </b>
                        {period.invoice_number ? (
                          <span className="sub">{period.invoice_number}</span>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={t("range")}>
                      <Time value={period.period_start} date /> –{" "}
                      <Time value={period.period_end} date />
                    </Td>
                    <Td className="text-right tabular-nums" label={t("amount")}>
                      {money(period.amount)}
                    </Td>
                    <Td label={t("dueOrPaid")}>
                      {period.paid_at ? (
                        <>
                          {t("paidOn")} <Time value={period.paid_at} date />
                        </>
                      ) : period.due_at ? (
                        <>
                          {t("dueOn")} <Time value={period.due_at} date />
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td label={t("state")}>
                      <span className={BADGE[period.status] ?? "badge"}>
                        <span className="dot" />
                        {t.has(`period.${period.status}`)
                          ? t(`period.${period.status}`)
                          : period.status}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </section>

      {profile ? (
        <section className="block" aria-labelledby="profile-h">
          <div className="block-head">
            <h3 id="profile-h" className="h2">
              {t("profile.title")}
            </h3>
            <SampleBadge step="35" endpoint="GET/PUT /api/v1/plans/billing-profile" />
          </div>
          <p className="fhint">{t("profile.about")}</p>
          <BillingProfileForm
            profile={profile}
            provinces={SAMPLE_PROVINCES.map((p) => ({ value: p.id, label: p.name }))}
            editable={manage}
          />
        </section>
      ) : null}
    </div>
  );
}
