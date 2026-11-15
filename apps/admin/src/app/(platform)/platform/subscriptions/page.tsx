import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Chips } from "@/components/engage/common";
import { PlatformHead, StatusBadge, SUB_BADGE } from "@/components/platform/common";
import { SubscriptionActions } from "@/components/platform/subscription-actions";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { oneOf, type SearchParams } from "@/lib/engage";
import { formatMoney } from "@/lib/format";
import { SUBSCRIPTIONS_MANAGE, SUBSCRIPTIONS_READ } from "@/lib/permissions";
import { daysUntil } from "@/lib/platform";
import { can } from "@/lib/viewer";
import { listTenants } from "@/sample/platform";
import type { SubscriptionStatus } from "@/sample/platform-data";
import { listPeriods, listPlans, listSubscriptions } from "@/sample/platform-plans";

const STATUSES: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "canceled",
];
const ENDPOINTS =
  "GET /api/v1/plans/subscriptions?status=, PUT /api/v1/plans/tenants/{id}/subscription, POST …/subscription/cancel, POST /api/v1/plans/billing-periods/{id}/mark-paid (bước 35); mới: danh sách kỳ thanh toán theo khách, đặt / bỏ chỉ đọc";

// Màn "Thuê bao" (dữ liệu mẫu, W-014): vòng đời thuê bao của mọi khách, kỳ thanh toán đang mở,
// đánh dấu đã thu khi khách chuyển khoản, gán gói, đặt chỉ đọc, huỷ. Job tự chuyển trạng thái tới hạn.
export default async function SubscriptionsPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await sampleGate(SUBSCRIPTIONS_READ);
  if (gate) return gate;
  const t = await getTranslations("platform.subs");
  const tp = await getTranslations("platform");
  const locale = await getLocale();
  const status = oneOf(await props.searchParams, "status", STATUSES);
  const [{ data: all }, { data: tenants }, { data: plans }, { data: periods }, manage] =
    await Promise.all([
      listSubscriptions(),
      listTenants(),
      listPlans(),
      listPeriods({ status: "open" }),
      can(SUBSCRIPTIONS_MANAGE),
    ]);
  const now = Date.now();
  // Việc gấp lên đầu: quá hạn, chỉ đọc, rồi dùng thử sắp hết.
  const rank: Record<SubscriptionStatus, number> = {
    past_due: 0,
    suspended: 1,
    trialing: 2,
    active: 3,
    canceled: 4,
    deleted: 5,
  };
  const subs = all
    .filter((s) => !status || s.status === status)
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] || a.current_period_end.localeCompare(b.current_period_end),
    );
  const count = (s: SubscriptionStatus) => all.filter((x) => x.status === s).length;
  const kpis: [string, number, string][] = [
    ["active", count("active"), t("kpiActive")],
    [
      "trialing",
      count("trialing"),
      t("kpiTrial", {
        count: all.filter(
          (x) => x.status === "trialing" && x.trial_ends_at && daysUntil(x.trial_ends_at, now) <= 7,
        ).length,
      }),
    ],
    ["past_due", count("past_due"), t("kpiPastDue")],
    ["suspended", count("suspended"), t("kpiSuspended")],
  ];
  return (
    <div className="page">
      <PlatformHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("description")}
        step="35"
        endpoint={ENDPOINTS}
      />
      <section className="kpis pf-kpis" aria-label={t("kpiLabel")}>
        {kpis.map(([key, value, sub]) => (
          <div key={key} className="card kpi">
            <span className="kpi-label">{tp(`subStatus.${key}`)}</span>
            <b className="kpi-value">{value}</b>
            <span className="kpi-sub">{sub}</span>
          </div>
        ))}
      </section>
      <p className="note">
        <b>{t("noteStrong")}</b> {t("noteText")}
      </p>
      <section className="block" aria-labelledby="pf-subs-h">
        <h2 id="pf-subs-h" className="h2">
          {t("listTitle")}
        </h2>
        <p className="fhint">{t("lifecycle")}</p>
        <Chips
          label={t("filter")}
          chips={[
            { href: "/platform/subscriptions", label: tp("all"), on: !status, count: all.length },
            ...STATUSES.map((s) => ({
              href: `/platform/subscriptions?status=${s}`,
              label: tp(`subStatus.${s}`),
              on: s === status,
              count: count(s),
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("colTenant")}</Th>
                <Th>{t("colPeriod")}</Th>
                <Th>{t("colOpen")}</Th>
                <Th>{t("colStatus")}</Th>
                <Th>
                  <span className="vh">{tp("tenant.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {subs.map((sub) => {
                const tenant = tenants.find((x) => x.id === sub.tenant_id);
                const plan = plans.find((p) => p.id === sub.plan_id);
                const price = plan?.prices.find((p) => p.id === sub.price_id);
                const open = periods.find((p) => p.tenant_id === sub.tenant_id);
                const note =
                  sub.status === "trialing" && sub.trial_ends_at
                    ? tp("tenants.trialLeft", { days: daysUntil(sub.trial_ends_at, now) })
                    : sub.status === "past_due" && sub.grace_ends_at
                      ? tp("tenants.graceLeft", { days: daysUntil(sub.grace_ends_at, now) })
                      : sub.status === "suspended" && sub.suspended_at
                        ? tp("tenants.readOnlyFor", { days: -daysUntil(sub.suspended_at, now) })
                        : null;
                if (!tenant) return null;
                return (
                  <tr key={sub.tenant_id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link href={`/platform/tenants/${tenant.id}`} className="open">
                          {tenant.name}
                        </Link>
                        <span className="sub">
                          {plan?.name ?? "—"}
                          {price ? ` · ${tp(`interval.${price.interval}`)}` : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("colPeriod")}>
                      <span className="cell2">
                        <span>
                          <Time value={sub.current_period_start} date /> –{" "}
                          <Time value={sub.current_period_end} date />
                        </span>
                        {sub.addons.length > 0 ? (
                          <span className="sub">
                            {t("withAddons", { count: sub.addons.length })}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={t("colOpen")}>
                      {open ? (
                        <span className="cell2">
                          <span>
                            {formatMoney(open.amount_minor, open.amount_currency, locale)}
                          </span>
                          {open.due_at ? (
                            <span
                              className={Date.parse(open.due_at) < now ? "sub tone-bad" : "sub"}
                            >
                              {t("due")} <Time value={open.due_at} date />
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </Td>
                    <Td label={t("colStatus")}>
                      <span className="cell2">
                        <StatusBadge
                          className={SUB_BADGE[sub.status]}
                          label={tp(`subStatus.${sub.status}`)}
                        />
                        {note ? <span className="sub">{note}</span> : null}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      {manage ? (
                        <SubscriptionActions
                          tenant={tenant}
                          subscription={sub}
                          periods={periods}
                          plans={plans}
                        />
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {subs.length === 0 ? <p className="empty">{t("none")}</p> : null}
        </div>
      </section>
    </div>
  );
}
