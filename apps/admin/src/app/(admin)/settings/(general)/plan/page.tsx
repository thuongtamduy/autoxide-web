import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { SampleBadge } from "@/components/sample-badge";
import { BillingProfileForm, ChangePlanDialog } from "@/components/settings/sample-forms";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatBytes, formatCount, formatMoney } from "@/lib/format";
import { BILLING_MANAGE, BILLING_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { SAMPLE_PROVINCES } from "@/sample/org";
import {
  type BillingPeriodStatus,
  getBillingProfile,
  getSubscription,
  type LimitUsage,
  listBillingPeriods,
  listCatalog,
  listLimits,
  usagePercent,
} from "@/sample/settings";
import { cancelRenewalAction, resumeRenewalAction } from "../../sample-actions";

const STATUSES: BillingPeriodStatus[] = ["open", "paid", "void"];
const BADGE: Record<BillingPeriodStatus, string> = {
  open: "badge b-warn",
  paid: "badge b-ok",
  void: "badge b-arch",
};

// Tab "Gói và thuê bao" (dữ liệu mẫu, chờ `/api/v1/plans/…` của bước 35): gói đang dùng, mức dùng
// hạn mức, kỳ thanh toán, hồ sơ xuất hoá đơn. Tiền thuê bao đi qua cổng của nhà vận hành.
export default async function PlanPage(props: PageProps<"/settings/plan">) {
  const gate = await sampleGate(BILLING_READ);
  if (gate) return gate;
  const t = await getTranslations("settings.plan");
  const locale = await getLocale();
  const { status } = await props.searchParams;
  const current = STATUSES.find((s) => s === status);
  const [{ data: sub }, { data: limits }, periods, all, { data: catalog }, { data: profile }] =
    await Promise.all([
      getSubscription(),
      listLimits(),
      listBillingPeriods(current ? { status: current } : {}),
      listBillingPeriods(),
      listCatalog(),
      getBillingProfile(),
    ]);
  const manage = await can(BILLING_MANAGE);
  const money = (minor: number, currency: string) => formatMoney(minor, currency, locale);
  const due = all.data.filter((p) => p.status === "open");
  const dueTotal = due.reduce((sum, p) => sum + p.amount_minor, 0);
  const tightest = [...limits].sort((a, b) => usagePercent(b) - usagePercent(a))[0];
  const amount = (limit: LimitUsage) =>
    limit.unit === "bytes"
      ? `${formatBytes(limit.used, locale)} / ${formatBytes(limit.max, locale)}`
      : `${formatCount(limit.used, locale)} / ${formatCount(limit.max, locale)}`;
  const priceOptions = catalog
    .filter((plan) => plan.kind === "base")
    .flatMap((plan) =>
      plan.prices.map((price) => ({
        value: price.id,
        label: `${plan.name} · ${money(price.amount_minor, price.amount_currency)} / ${t(`interval.${price.interval}`)}`,
      })),
    );
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, all.data.filter((p) => p.status === s).length]),
  );

  return (
    <div className="blocks">
      <section className="block" aria-labelledby="plan-h">
        <div className="block-head">
          <h2 id="plan-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge
            step="35"
            endpoint="GET /api/v1/plans/subscription, /entitlements, /billing-periods, /billing-profile"
          />
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("kpiPlan")}</span>
            <b className="kpi-value">{sub.plan.name}</b>
            <span className="kpi-sub">
              {t(`interval.${sub.price.interval}`)} ·{" "}
              {sub.cancel_at_period_end ? t("endsOn") : t("renewsOn")}{" "}
              <Time value={sub.current_period_end} date />
            </span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("kpiStatus")}</span>
            <b className="kpi-value">{t(`status.${sub.status}`)}</b>
            <span className="kpi-sub">
              {sub.cancel_at_period_end ? t("renewalOff") : t("renewalOn")}
            </span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("kpiDue")}</span>
            <b className="kpi-value">{money(dueTotal, "VND")}</b>
            <span className="kpi-sub">{t("dueCount", { count: due.length })}</span>
          </div>
          {tightest ? (
            <div className="card kpi">
              <span className="kpi-label">{t("kpiLimit")}</span>
              <b className="kpi-value">{usagePercent(tightest)}%</b>
              <span className="kpi-sub">
                {t(`limits.${tightest.key.replaceAll(".", "_")}`)} {amount(tightest)}
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
          <div className="item">
            <div className="item-main">
              <span className="item-title">
                {sub.plan.name} · {t("basePlan")}
              </span>
              <span className="item-meta">
                {money(sub.price.amount_minor, sub.price.amount_currency)} /{" "}
                {t(`interval.${sub.price.interval}`)} · {t("modules", { count: sub.plan.modules })}{" "}
                · <Time value={sub.current_period_start} date /> –{" "}
                <Time value={sub.current_period_end} date />
              </span>
              {sub.scheduled_plan ? (
                <span className="item-meta">
                  {t("scheduled", { plan: sub.scheduled_plan.name })}
                </span>
              ) : null}
            </div>
            <span className={sub.cancel_at_period_end ? "badge b-warn" : "badge b-ok"}>
              <span className="dot" />
              {sub.cancel_at_period_end ? t("ending") : t("inUse")}
            </span>
            {manage ? (
              <span className="item-acts">
                <ChangePlanDialog options={priceOptions} current={sub.price.id} />
                {sub.cancel_at_period_end ? (
                  <InlineAction
                    action={resumeRenewalAction}
                    id={sub.id}
                    label={t("resume")}
                    done={t("resumed")}
                  />
                ) : (
                  <ConfirmAction
                    action={cancelRenewalAction}
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
          {sub.addons.map((addon) => (
            <div className="item" key={addon.plan.id}>
              <div className="item-main">
                <span className="item-title">
                  {addon.plan.name} · {t("addon", { count: addon.quantity })}
                </span>
                <span className="item-meta">
                  {money(addon.price.amount_minor, addon.price.amount_currency)} /{" "}
                  {t(`interval.${addon.price.interval}`)} · {t("since")}{" "}
                  <Time value={addon.since} date />
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
        <div className="card padded meters">
          {limits.map((limit) => (
            <div className="meter" key={limit.key}>
              <div className="meter-head">
                <span>{t(`limits.${limit.key.replaceAll(".", "_")}`)}</span>
                <b>{amount(limit)}</b>
              </div>
              <progress
                className="bar"
                max={100}
                value={usagePercent(limit)}
                aria-label={t(`limits.${limit.key.replaceAll(".", "_")}`)}
              />
              {limit.period === "month" ? <span className="fhint">{t("monthly")}</span> : null}
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
            {t("all")} <span className="cnt">{all.data.length}</span>
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
          {periods.data.length === 0 ? (
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
                {periods.data.map((period) => (
                  <tr key={period.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>
                          {t(`kind.${period.kind}`)} · {period.plan.name}
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
                      {money(period.amount_minor, period.amount_currency)}
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
                      <span className={BADGE[period.status]}>
                        <span className="dot" />
                        {t(`period.${period.status}`)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </section>

      <section className="block" aria-labelledby="profile-h">
        <h3 id="profile-h" className="h2">
          {t("profile.title")}
        </h3>
        <p className="fhint">{t("profile.about")}</p>
        <BillingProfileForm
          profile={profile}
          provinces={SAMPLE_PROVINCES.map((p) => ({ value: p.id, label: p.name }))}
          editable={manage}
        />
      </section>
    </div>
  );
}
