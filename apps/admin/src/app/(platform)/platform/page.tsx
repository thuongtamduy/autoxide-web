import Form from "next/form";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips } from "@/components/engage/common";
import { TipHeading } from "@/components/help/info-tip";
import {
  PlatformHead,
  SCHEMA_BADGE,
  StatusBadge,
  SUB_BADGE,
  TENANT_BADGE,
  UsageMeter,
} from "@/components/platform/common";
import { NewTenantDialog } from "@/components/platform/new-tenant";
import { ProvisionDialog } from "@/components/platform/provision-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { load } from "@/lib/core";
import type { SearchParams } from "@/lib/engage";
import { formatMoney } from "@/lib/format";
import { initialsOf } from "@/lib/initials";
import { PROVISION, TENANTS_MANAGE, TENANTS_READ } from "@/lib/permissions";
import { tightest } from "@/lib/plans";
import { loadTenantPlans } from "@/lib/plans-server";
import {
  daysUntil,
  matchesQuery,
  orderTree,
  PLACEMENT_KINDS,
  type PlatformTenant,
  parseTenantQuery,
  SCHEMA_STATES,
  SUBSCRIPTION_STATES,
  sameQuery,
  TENANT_VIEWS,
  type TenantQuery,
  type TenantRow,
  tenantQueryHref,
} from "@/lib/platform";
import {
  filteredTenants,
  type PlatformData,
  platformData,
  platformGate,
  platformRefused,
} from "@/lib/platform-server";
import { can } from "@/lib/viewer";
import type { SubscriptionStatus } from "@/sample/platform-data";

// Màn "Khách hàng" của mặt điều khiển: sổ khách và placement THẬT của core (bước 33) — tên, trạng
// thái, cây khách, nơi lưu, migration, cờ chỉ đọc; lọc theo chỉ đọc / loại placement / trạng thái
// migration / thuê bao / gần chạm hạn mức do core lọc (D-296, bước 35; tham số trên địa chỉ trang);
// tạo khách mới bằng `POST /kernel/tenants`. Gói và thuê bao của module `plans` (đợt 3b): đọc mọi
// thuê bao và mức dùng đi kèm sổ khách (`expand=subscription,usage`, D-335). Khách chỉ có trong luồng
// cấp phát mẫu là dữ liệu mẫu (W-014). Không có dữ liệu nghiệp vụ của khách ở đây.
export default async function TenantsPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await platformGate(TENANTS_READ);
  if (gate) return gate;
  const t = await getTranslations("platform");
  const locale = await getLocale();
  const params = await props.searchParams;
  const query = parseTenantQuery(params);
  let data: PlatformData;
  try {
    data = await platformData();
  } catch (error) {
    const refused = await platformRefused(error);
    if (refused) return refused;
    throw error;
  }
  const { tenants, placements } = data;
  const [billing, listed] = await Promise.all([loadTenantPlans(), filteredTenants(query, data)]);
  const plans = billing?.plans ?? [];
  // Thuê bao và mức dùng đi kèm sổ khách (`expand=subscription,usage`, D-335).
  const rowOf = (tenant: PlatformTenant): TenantRow => {
    const subscription = billing ? tenant.subscription : null;
    return {
      tenant,
      // Placement đi kèm sổ khách (`expand=placement`); khách mẫu: placement mẫu cùng id.
      placement: tenant.placement ?? placements.find((p) => p.id === tenant.placement_id) ?? null,
      subscription,
      plan: plans.find((p) => p.id === subscription?.plan_id) ?? null,
      nearest: billing ? tightest(tenant.usage ?? []) : null,
      children: tenants.filter((x) => x.parent_id === tenant.id).length,
    };
  };
  const rows = tenants.map(rowOf);
  const shown = orderTree(
    listed
      .map((tenant) => rows.find((row) => row.tenant.id === tenant.id) ?? rowOf(tenant))
      .filter((row) => matchesQuery(row, query))
      .map((row) => ({
        ...row,
        id: row.tenant.id,
        name: row.tenant.name,
        parent_id: row.tenant.parent_id,
      })),
  );
  const [provision, manage] = await Promise.all([can(PROVISION), can(TENANTS_MANAGE)]);
  const mode = await currentMode();
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
    ...(billing
      ? [
          {
            key: "trial",
            value: customers.filter((row) => row.subscription?.status === "trialing").length,
            sub: t("tenants.kpi.trialSub", {
              count: customers.filter((row) => {
                const ends = row.subscription?.trial_ends_at;
                return (
                  row.subscription?.status === "trialing" && !!ends && daysUntil(ends, now) <= 7
                );
              }).length,
            }),
          },
          {
            key: "overdue",
            value: customers.filter((row) =>
              ["past_due", "suspended"].includes(row.subscription?.status ?? ""),
            ).length,
            sub: t("tenants.kpi.overdueSub"),
          },
        ]
      : []),
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

  return (
    <div className="page">
      <PlatformHead
        crumb={t("tenants.crumb")}
        title={t("tenants.title")}
        description={t("tenants.description")}
        actions={
          <>
            {manage ? (
              <Link href="/platform/fleet" className="btn">
                {t("tenants.migrateAll")}
              </Link>
            ) : null}
            {manage ? (
              <NewTenantDialog
                placements={placements
                  .filter((p) => p.source === "core")
                  .map((p) => ({ value: p.name, label: p.name }))}
                parents={tenants
                  .filter((x) => x.source === "core")
                  .map((x) => ({ value: x.id, label: x.name }))}
              />
            ) : null}
            {provision ? <ProvisionDialog primary={false} /> : null}
          </>
        }
      />

      {mode === "single" ? <p className="note">{t("tenants.singleMode")}</p> : null}

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
        <TipHeading id="pf-tenants-h" tip="placement">
          {t("tenants.list")}
        </TipHeading>
        <Chips
          label={t("tenants.filterLabel")}
          chips={TENANT_VIEWS.filter(
            (view) =>
              billing || !("subscription_status" in view.query || "near_limit" in view.query),
          ).map((view) => ({
            href: tenantQueryHref(view.query),
            label: t(`tenants.filter.${view.key}`),
            on: sameQuery(view.query, query),
            // Số trên chip đếm trong sổ đầy đủ đã đọc cho trang, theo cùng luật với core.
            count: rows.filter((row) => matchesQuery(row, view.query)).length,
          }))}
        />
        <TenantFilterForm query={query} plans={billing !== null} />
        <div className="card tcard">
          <Table cards className="pf-table">
            <thead>
              <tr>
                <Th>{t("tenants.col.tenant")}</Th>
                <Th>{t("tenants.col.plan")}</Th>
                <Th>{t("tenants.col.place")}</Th>
                {billing ? <Th>{t("tenants.col.subscription")}</Th> : null}
                {billing ? <Th>{t("tenants.col.limit")}</Th> : null}
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
                          {tenant.source === "sample" ? (
                            <span className="tag" title={t("tenants.sampleRowHint")}>
                              {t("tenants.sampleRow")}
                            </span>
                          ) : null}
                          <span className="sub mono ell">
                            {tenant.primary_domain ?? tenant.slug}
                          </span>
                          {tenant.status !== "active" ? (
                            <StatusBadge
                              className={TENANT_BADGE[tenant.status]}
                              label={t(`tenantStatus.${tenant.status}`)}
                            />
                          ) : null}
                          {tenant.read_only ? (
                            <StatusBadge className="badge b-warn" label={t("readOnly.badge")} />
                          ) : null}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("tenants.col.plan")}>
                      <span className="cell2">
                        <span>
                          {tenant.is_platform
                            ? t("tenants.platformTenant")
                            : billing
                              ? (subscription?.plan_name ?? plan?.name ?? t("tenants.noPlan"))
                              : "—"}
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
                            {t(`backend.${placement.backend}`)}
                            {placement.location ? ` · ${placement.location}` : ""}
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
                    {billing ? (
                      <Td label={t("tenants.col.subscription")}>
                        {subscription ? (
                          <span className="cell2">
                            <StatusBadge
                              className={
                                SUB_BADGE[subscription.status as SubscriptionStatus] ?? "badge"
                              }
                              label={
                                t.has(`subStatus.${subscription.status}`)
                                  ? t(`subStatus.${subscription.status}`)
                                  : subscription.status
                              }
                            />
                            {note ? <span className="sub">{note}</span> : null}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </Td>
                    ) : null}
                    {billing ? (
                      <Td label={t("tenants.col.limit")}>
                        {row.nearest ? (
                          <UsageMeter usage={row.nearest} compact />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {shown.length === 0 ? <p className="empty">{t("tenants.none")}</p> : null}
        </div>
      </section>

      {billing ? (
        <section className="block" aria-labelledby="pf-plans-h">
          <div className="block-head">
            <TipHeading id="pf-plans-h" tip="plans">
              {t("tenants.plansTitle")}
            </TipHeading>
            <Link href="/platform/plans" className="btn sm">
              {t("tenants.plansOpen")}
            </Link>
          </div>
          <p className="fhint">{t("tenants.plansAbout")}</p>
          <ul className="pf-planrow">
            {plans
              .filter((p) => p.kind === "base" && p.status === "active")
              .map((plan) => {
                const cheapest = plan.prices
                  .filter((p) => p.active && p.kind === "recurring")
                  .sort((a, b) => Number(a.amount.amount) - Number(b.amount.amount))[0];
                return (
                  <li key={plan.id} className="card pf-plan">
                    <span className="pf-plan-head">
                      <b>{plan.name}</b>
                      <span className="cnt">
                        {t("tenants.subscribers", { count: plan.subscriber_count ?? 0 })}
                      </span>
                    </span>
                    <span className="pf-plan-price">
                      {cheapest
                        ? t("price", {
                            amount: formatMoney(
                              cheapest.amount.amount,
                              cheapest.amount.currency,
                              locale,
                            ),
                            interval: t(
                              `interval.${cheapest.interval === "year" ? "year" : "month"}`,
                            ),
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
      ) : null}
    </div>
  );
}

/**
 * Lọc kết hợp (chip chỉ chọn một): các ô chọn là tham số của `GET /kernel/tenants` (thuê bao và
 * gần chạm hạn mức chỉ khi có module `plans`). Form GET: kết quả
 * nằm trên địa chỉ, chạy cả khi chưa có JS; "cần để ý" đang bật thì giữ lại.
 */
async function TenantFilterForm({ query, plans }: { query: TenantQuery; plans: boolean }) {
  const t = await getTranslations("platform");
  return (
    <Form
      action="/platform"
      className="pf-filters"
      role="search"
      aria-label={t("tenants.filterForm")}
    >
      {query.attention ? <input type="hidden" name="attention" value="true" /> : null}
      <label>
        <span className="vh">{t("tenants.filterReadOnly")}</span>
        <select
          className="inp"
          name="read_only"
          defaultValue={query.read_only === undefined ? "" : String(query.read_only)}
        >
          <option value="">{t("tenants.anyWrite")}</option>
          <option value="true">{t("tenants.onlyReadOnly")}</option>
          <option value="false">{t("tenants.onlyWritable")}</option>
        </select>
      </label>
      <label>
        <span className="vh">{t("tenants.filterKind")}</span>
        <select className="inp" name="placement_kind" defaultValue={query.placement_kind ?? ""}>
          <option value="">{t("tenants.anyKind")}</option>
          {PLACEMENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`placementKind.${kind}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="vh">{t("tenants.filterSchema")}</span>
        <select className="inp" name="schema_state" defaultValue={query.schema_state ?? ""}>
          <option value="">{t("tenants.anySchema")}</option>
          {SCHEMA_STATES.map((state) => (
            <option key={state} value={state}>
              {t(`schema.${state}`)}
            </option>
          ))}
        </select>
      </label>
      {plans ? (
        <label>
          <span className="vh">{t("tenants.filterSub")}</span>
          <select
            className="inp"
            name="subscription_status"
            defaultValue={query.subscription_status ?? ""}
          >
            <option value="">{t("tenants.anySub")}</option>
            {SUBSCRIPTION_STATES.map((state) => (
              <option key={state} value={state}>
                {t(`subStatus.${state}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {plans ? (
        <label className="check">
          <input type="checkbox" name="near_limit" value="true" defaultChecked={query.near_limit} />
          <span>{t("tenants.onlyNear")}</span>
        </label>
      ) : null}
      <button type="submit" className="btn">
        {t("tenants.apply")}
      </button>
      {tenantQueryHref(query) !== "/platform" ? (
        <Link className="btn ghost" href="/platform">
          {t("tenants.clear")}
        </Link>
      ) : null}
    </Form>
  );
}

/** Chế độ của bản cài (`single`: một khách, không tạo thêm được), `null` khi không đọc được. */
async function currentMode(): Promise<string | null> {
  try {
    return (await load((client) => client.GET("/api/v1/kernel/tenant"))).data.mode;
  } catch {
    return null;
  }
}
