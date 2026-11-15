import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Chips } from "@/components/engage/common";
import {
  PlatformHead,
  SCHEMA_BADGE,
  StatusBadge,
  SUB_BADGE,
  TENANT_BADGE,
  UsageMeter,
} from "@/components/platform/common";
import { ProvisionDialog } from "@/components/platform/provision-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { oneOf, type SearchParams } from "@/lib/engage";
import { formatMoney } from "@/lib/format";
import { initialsOf } from "@/lib/initials";
import { PROVISION, TENANTS_MANAGE, TENANTS_READ } from "@/lib/permissions";
import {
  daysUntil,
  matchesFilter,
  orderTree,
  TENANT_FILTERS,
  type TenantFilter,
  type TenantRow,
} from "@/lib/platform";
import { can } from "@/lib/viewer";
import { listPlacements, listTenants } from "@/sample/platform";
import { getUsage, listPlans, listSubscriptions, nearestLimit } from "@/sample/platform-plans";

const ENDPOINTS =
  "GET /api/v1/kernel/tenants, GET /api/v1/kernel/placements (bước 33); GET /api/v1/plans/subscriptions, GET /api/v1/plans/tenants/{id}/usage, GET /api/v1/plans/plans (bước 35)";

// Màn "Khách hàng" của mặt điều khiển (dữ liệu mẫu, W-014): sổ khách kèm mô hình, gói, vị trí dữ
// liệu, migration, thuê bao, hạn mức gần chạm nhất. Không có dữ liệu nghiệp vụ của khách ở đây.
export default async function TenantsPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await sampleGate(TENANTS_READ);
  if (gate) return gate;
  const t = await getTranslations("platform");
  const locale = await getLocale();
  const params = await props.searchParams;
  const filter: TenantFilter = oneOf(params, "filter", TENANT_FILTERS) ?? "all";
  const [{ data: tenants }, { data: placements }, { data: subs }, { data: plans }] =
    await Promise.all([listTenants(), listPlacements(), listSubscriptions(), listPlans()]);
  const usage = await Promise.all(tenants.map((x) => getUsage(x.id)));
  const rows: TenantRow[] = tenants.map((tenant, index) => {
    const subscription = subs.find((s) => s.tenant_id === tenant.id) ?? null;
    return {
      tenant,
      placement: placements.find((p) => p.id === tenant.placement_id) ?? null,
      subscription,
      plan: plans.find((p) => p.id === subscription?.plan_id) ?? null,
      nearest: nearestLimit(usage[index]?.data ?? []),
      children: tenants.filter((x) => x.parent_id === tenant.id).length,
    };
  });
  const shown = orderTree(
    rows.map((row) => ({
      ...row,
      id: row.tenant.id,
      name: row.tenant.name,
      parent_id: row.tenant.parent_id,
    })),
  ).filter(({ item }) => matchesFilter(item, filter));
  const [provision, manage] = await Promise.all([can(PROVISION), can(TENANTS_MANAGE)]);
  const customers = rows.filter((row) => !row.tenant.is_platform);
  const now = Date.now();
  const kpis = [
    {
      key: "active",
      value: customers.filter((row) => row.tenant.status === "active").length,
      sub: t("tenants.kpi.activeSub", {
        models: new Set(customers.map((r) => r.tenant.business_model)).size,
      }),
    },
    {
      key: "trial",
      value: customers.filter((row) => row.subscription?.status === "trialing").length,
      sub: t("tenants.kpi.trialSub", {
        count: customers.filter(
          (row) =>
            row.subscription?.status === "trialing" &&
            row.subscription.trial_ends_at !== null &&
            daysUntil(row.subscription.trial_ends_at, now) <= 7,
        ).length,
      }),
    },
    {
      key: "overdue",
      value: customers.filter((row) =>
        ["past_due", "suspended"].includes(row.subscription?.status ?? ""),
      ).length,
      sub: t("tenants.kpi.overdueSub"),
    },
    {
      key: "migration",
      value: placements.filter((p) => p.schema_state !== "ready").length,
      sub: t("tenants.kpi.migrationSub", { count: placements.length }),
    },
  ];
  const subNote = (row: TenantRow): string | null => {
    const sub = row.subscription;
    if (!sub) return null;
    if (sub.status === "trialing" && sub.trial_ends_at) {
      return t("tenants.trialLeft", { days: daysUntil(sub.trial_ends_at, now) });
    }
    if (sub.status === "past_due" && sub.grace_ends_at) {
      return t("tenants.graceLeft", { days: daysUntil(sub.grace_ends_at, now) });
    }
    if (sub.status === "suspended" && sub.suspended_at) {
      return t("tenants.readOnlyFor", { days: -daysUntil(sub.suspended_at, now) });
    }
    return null;
  };
  const counts = Object.fromEntries(
    TENANT_FILTERS.map((f) => [f, rows.filter((row) => matchesFilter(row, f)).length]),
  );

  return (
    <div className="page">
      <PlatformHead
        crumb={t("tenants.crumb")}
        title={t("tenants.title")}
        description={t("tenants.description")}
        step="33"
        endpoint={ENDPOINTS}
        actions={
          <>
            {manage ? (
              <Link href="/platform/fleet" className="btn">
                {t("tenants.migrateAll")}
              </Link>
            ) : null}
            {provision ? <ProvisionDialog /> : null}
          </>
        }
      />

      <section className="kpis pf-kpis" aria-label={t("tenants.kpi.label")}>
        {kpis.map((kpi) => (
          <div key={kpi.key} className="card kpi">
            <span className="kpi-label">{t(`tenants.kpi.${kpi.key}`)}</span>
            <b className="kpi-value">{kpi.value}</b>
            <span className="kpi-sub">{kpi.sub}</span>
          </div>
        ))}
      </section>

      <section className="block" aria-labelledby="pf-tenants-h">
        <h2 id="pf-tenants-h" className="h2">
          {t("tenants.list")}
        </h2>
        <Chips
          label={t("tenants.filterLabel")}
          chips={TENANT_FILTERS.map((f) => ({
            href: f === "all" ? "/platform" : `/platform?filter=${f}`,
            label: t(`tenants.filter.${f}`),
            on: f === filter,
            count: counts[f],
          }))}
        />
        <div className="card tcard">
          <Table cards className="pf-table">
            <thead>
              <tr>
                <Th>{t("tenants.col.tenant")}</Th>
                <Th>{t("tenants.col.plan")}</Th>
                <Th>{t("tenants.col.place")}</Th>
                <Th>{t("tenants.col.subscription")}</Th>
                <Th>{t("tenants.col.limit")}</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ item: row, depth }) => {
                const { tenant, placement, subscription, plan } = row;
                const note = subNote(row);
                return (
                  <tr key={tenant.id}>
                    <Td className="rt-title">
                      <span className={depth > 0 ? "pf-who child" : "pf-who"}>
                        <span className="tav" aria-hidden="true">
                          {tenant.is_platform ? "AX" : initialsOf(tenant.name)}
                        </span>
                        <span className="cell2">
                          <Link href={`/platform/tenants/${tenant.id}`} className="open">
                            {tenant.name}
                          </Link>
                          <span className="sub mono ell">
                            {tenant.primary_domain ?? tenant.slug}
                          </span>
                          {tenant.status !== "active" ? (
                            <StatusBadge
                              className={TENANT_BADGE[tenant.status]}
                              label={t(`tenantStatus.${tenant.status}`)}
                            />
                          ) : null}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("tenants.col.plan")}>
                      <span className="cell2">
                        <span>
                          {tenant.is_platform
                            ? t("tenants.platformTenant")
                            : (plan?.name ?? t("tenants.noPlan"))}
                        </span>
                        <span className="sub">
                          {tenant.business_model ? t(`models.${tenant.business_model}`) : "—"}
                          {row.children > 0
                            ? ` · ${t("tenants.children", { count: row.children })}`
                            : ""}
                          {depth > 0 ? ` · ${t("tenants.childOf")}` : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("tenants.col.place")}>
                      {placement ? (
                        <span className="cell2">
                          <span>
                            {t(`placementKind.${placement.kind}`)} ·{" "}
                            <span className="mono">{placement.name}</span>
                          </span>
                          <span className="sub">
                            {t(`backend.${placement.backend}`)} · {placement.location}
                          </span>
                          {placement.schema_state !== "ready" ? (
                            <StatusBadge
                              className={SCHEMA_BADGE[placement.schema_state]}
                              label={
                                placement.schema_state === "behind"
                                  ? t("tenants.pending", {
                                      count: placement.pending_migrations.length,
                                    })
                                  : t(`schema.${placement.schema_state}`)
                              }
                            />
                          ) : null}
                        </span>
                      ) : (
                        <span className="muted">{t("tenants.preparing")}</span>
                      )}
                    </Td>
                    <Td label={t("tenants.col.subscription")}>
                      {subscription ? (
                        <span className="cell2">
                          <StatusBadge
                            className={SUB_BADGE[subscription.status]}
                            label={t(`subStatus.${subscription.status}`)}
                          />
                          {note ? <span className="sub">{note}</span> : null}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </Td>
                    <Td label={t("tenants.col.limit")}>
                      {row.nearest ? (
                        <UsageMeter usage={row.nearest} compact />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {shown.length === 0 ? <p className="empty">{t("tenants.none")}</p> : null}
        </div>
      </section>

      <section className="block" aria-labelledby="pf-plans-h">
        <div className="block-head">
          <h2 id="pf-plans-h" className="h2">
            {t("tenants.plansTitle")}
          </h2>
          <Link href="/platform/plans" className="btn sm">
            {t("tenants.plansOpen")}
          </Link>
        </div>
        <p className="fhint">{t("tenants.plansAbout")}</p>
        <ul className="pf-planrow">
          {plans
            .filter((p) => p.kind === "base" && p.status === "active")
            .map((plan) => {
              const cheapest = [...plan.prices]
                .filter((p) => p.active)
                .sort((a, b) => a.amount_minor - b.amount_minor)[0];
              return (
                <li key={plan.id} className="card pf-plan">
                  <span className="pf-plan-head">
                    <b>{plan.name}</b>
                    <span className="cnt">
                      {t("tenants.subscribers", { count: plan.subscriber_count })}
                    </span>
                  </span>
                  <span className="pf-plan-price">
                    {cheapest
                      ? t("price", {
                          amount: formatMoney(
                            cheapest.amount_minor,
                            cheapest.amount_currency,
                            locale,
                          ),
                          interval: t(`interval.${cheapest.interval}`),
                        })
                      : "—"}
                  </span>
                  <span className="fhint">
                    {t("tenants.modules", { count: plan.modules.length })}
                  </span>
                  <span className="fhint">{t(`placementKind.${plan.placement}`)}</span>
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}
