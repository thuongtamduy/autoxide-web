import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Chips } from "@/components/engage/common";
import { MessagePanel } from "@/components/message-panel";
import { PlatformHead, StatusBadge, SUB_BADGE } from "@/components/platform/common";
import { PlanSubscriptionActions } from "@/components/platform/plan-subscription-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { oneOf, type SearchParams } from "@/lib/engage";
import { SUBSCRIPTIONS_MANAGE, SUBSCRIPTIONS_READ } from "@/lib/permissions";
import { loadAllPlans, loadAllSubscriptions } from "@/lib/plans-server";
import { daysUntil } from "@/lib/platform";
import { platformData } from "@/lib/platform-server";
import { can } from "@/lib/viewer";

type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "canceled" | "deleted";

const STATUSES: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "canceled",
];

// Màn "Thuê bao" (`GET /plans/subscriptions`, bước 35 của core): vòng đời thuê bao của mọi khách, gán
// gói, huỷ, khoá hẳn. Job của core tự chuyển trạng thái tới hạn. Core chưa có danh sách kỳ thanh toán
// theo khách cho nhân sự nền tảng: chưa có cột "kỳ đang mở" và nút "đánh dấu đã thu". Chưa có thuê bao
// nào thì không hiện bốn ô số 0: chưa có cả khách để gán gói thì một trạng thái rỗng thay cho trang;
// có khách chưa gán gói thì chỉ còn bảng các khách đó.
export default async function SubscriptionsPage(props: { searchParams: Promise<SearchParams> }) {
  if (!(await can(SUBSCRIPTIONS_READ))) {
    const errors = await getTranslations("errors");
    return (
      <MessagePanel
        title={errors("forbiddenTitle")}
        message={errors("forbidden", { permission: SUBSCRIPTIONS_READ })}
      />
    );
  }
  const t = await getTranslations("platform.subs");
  const tp = await getTranslations("platform");
  const status = oneOf(await props.searchParams, "status", STATUSES);
  const [all, { tenants }, plans, manage] = await Promise.all([
    loadAllSubscriptions(),
    platformData(),
    loadAllPlans(),
    can(SUBSCRIPTIONS_MANAGE),
  ]);
  const now = Date.now();
  // Việc gấp lên đầu: quá hạn, chỉ đọc, rồi dùng thử sắp hết.
  const rank: Record<string, number> = {
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
        (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
        a.current_period_end.localeCompare(b.current_period_end),
    );
  const count = (s: SubscriptionStatus) => all.filter((x) => x.status === s).length;
  // Khách của core chưa có thuê bao (dùng gói mặc định): hiện để gán gói. Khách nền tảng không có gói.
  const without = tenants.filter(
    (x) => x.source === "core" && !x.is_platform && !all.some((s) => s.tenant_id === x.id),
  );
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
      <PlatformHead crumb={t("crumb")} title={t("title")} description={t("description")} />
      {all.length === 0 && without.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="card"
            title={t("emptyTitle")}
            actions={
              <>
                <Link className="btn pri" href="/platform">
                  {t("openRegister")}
                </Link>
                <Link className="btn" href="/platform/plans">
                  {t("openPlans")}
                </Link>
              </>
            }
          >
            {t("emptyText")}
          </EmptyState>
        </div>
      ) : null}
      {all.length > 0 ? (
        <>
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
        </>
      ) : null}
      {all.length === 0 && without.length === 0 ? null : (
        <section className="block" aria-labelledby="pf-subs-h">
          <h2 id="pf-subs-h" className="h2">
            {t("listTitle")}
          </h2>
          <p className="fhint">{t("lifecycle")}</p>
          {all.length === 0 ? (
            <p className="fhint">{t("withoutHint")}</p>
          ) : (
            <Chips
              label={t("filter")}
              chips={[
                {
                  href: "/platform/subscriptions",
                  label: tp("all"),
                  on: !status,
                  count: all.length,
                },
                ...STATUSES.map((s) => ({
                  href: `/platform/subscriptions?status=${s}`,
                  label: tp(`subStatus.${s}`),
                  on: s === status,
                  count: count(s),
                })),
              ]}
            />
          )}
          <div className="card tcard">
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("colTenant")}</Th>
                  <Th>{t("colPeriod")}</Th>
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
                            {sub.plan_name ?? plan?.name ?? "—"}
                            {price
                              ? ` · ${tp(`interval.${price.interval === "year" ? "year" : "month"}`)}`
                              : ""}
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
                      <Td label={t("colStatus")}>
                        <span className="cell2">
                          <StatusBadge
                            className={SUB_BADGE[sub.status as SubscriptionStatus] ?? "badge"}
                            label={
                              tp.has(`subStatus.${sub.status}`)
                                ? tp(`subStatus.${sub.status}`)
                                : sub.status
                            }
                          />
                          {note ? <span className="sub">{note}</span> : null}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        {manage ? (
                          <PlanSubscriptionActions
                            tenant={tenant}
                            subscription={sub}
                            plans={plans}
                          />
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
                {status
                  ? null
                  : without.map((tenant) => (
                      <tr key={tenant.id}>
                        <Td className="rt-title">
                          <span className="cell2">
                            <Link href={`/platform/tenants/${tenant.id}`} className="open">
                              {tenant.name}
                            </Link>
                            <span className="sub">{t("defaultPlan")}</span>
                          </span>
                        </Td>
                        <Td label={t("colPeriod")}>—</Td>
                        <Td label={t("colStatus")}>
                          <span className="badge b-draft">{t("noSubscription")}</span>
                        </Td>
                        <Td className="rt-acts">
                          {manage ? (
                            <PlanSubscriptionActions
                              tenant={tenant}
                              subscription={null}
                              plans={plans}
                            />
                          ) : null}
                        </Td>
                      </tr>
                    ))}
              </tbody>
            </Table>
            {subs.length === 0 && (status || without.length === 0) ? (
              <p className="empty">{t("none")}</p>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
