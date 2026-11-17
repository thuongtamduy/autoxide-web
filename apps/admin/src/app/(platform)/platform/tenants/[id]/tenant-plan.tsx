import { ApiError } from "@autoxide/sdk";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Facts } from "@/components/engage/common";
import { StatusBadge, SUB_BADGE, UsageMeter } from "@/components/platform/common";
import { PlanSubscriptionActions } from "@/components/platform/plan-subscription-actions";
import { SupportGrantDialog, SupportGrantTable } from "@/components/platform/support-grants";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { allRoles } from "@/lib/access";
import { isNotFound, load } from "@/lib/core";
import { formatBytes, formatMoney } from "@/lib/format";
import {
  SUBSCRIPTIONS_MANAGE,
  SUBSCRIPTIONS_READ,
  SUPPORT_GRANT,
  TENANTS_OPERATE,
} from "@/lib/permissions";
import type { Subscription } from "@/lib/plans";
import { loadAllPlans } from "@/lib/plans-server";
import { loadGrants, loadStaff, supportAllowed, supportHours } from "@/lib/support-server";
import { can } from "@/lib/viewer";
import { markPaidAction } from "../../plan-actions";
import { exportTenantData } from "../../support-actions";

type Tenant = { id: string; name: string };

// Ba khối của chi tiết một khách gọi core THẬT (đợt 3b): thuê bao và hạn mức (module `plans`, bước
// 35), xuất toàn bộ dữ liệu (`/kernel/tenants/{id}/exports`), quyền vào dữ liệu khách
// (`/auth/support-grants`, bước 34). Mỗi khối chỉ hiện khi người xem có permission của nó; khách nền
// tảng không có khối nào (không bị gói giới hạn, nhân sự đã ở sẵn trong đó).

/** Thuê bao, hạn mức (kèm mức dùng) và thao tác trên thuê bao của một khách. */
export async function TenantPlanSection({ tenant }: { tenant: Tenant }) {
  if (!(await can(SUBSCRIPTIONS_READ))) return null;
  const t = await getTranslations("platform");
  const path = { params: { path: { tenant_id: tenant.id } } };
  let sub: Subscription | null;
  try {
    sub = (await load((c) => c.GET("/api/v1/plans/tenants/{tenant_id}/subscription", path))).data;
  } catch (error) {
    // 404: khách chưa có thuê bao, hay bản cài không có module `plans` (khi đó không hiện khối).
    if (!isNotFound(error)) throw error;
    if (error.code !== "plans.subscription_not_found") return null;
    sub = null;
  }
  const [usage, plans, manage, periods, profile] = await Promise.all([
    load((c) => c.GET("/api/v1/plans/tenants/{tenant_id}/usage", path)).then((r) => r.data),
    loadAllPlans(),
    can(SUBSCRIPTIONS_MANAGE),
    load((c) => c.GET("/api/v1/plans/tenants/{tenant_id}/billing-periods", path)).then(
      (r) => r.data,
    ),
    load((c) => c.GET("/api/v1/plans/tenants/{tenant_id}/billing-profile", path))
      .then((r) => r.data)
      .catch((error: unknown) => {
        if (isNotFound(error)) return null;
        throw error;
      }),
  ]);
  const locale = await getLocale();
  const plan = plans.find((p) => p.id === sub?.plan_id);
  const scheduled = plans.find((p) => p.id === sub?.scheduled_plan_id);
  const status = sub?.status ?? "";
  const facts: [string, ReactNode][] = [];
  if (sub) {
    facts.push([t("tenant.plan"), sub.plan_name ?? plan?.name ?? sub.plan_id.slice(0, 8)]);
    facts.push([
      sub.cancel_at_period_end ? t("tenant.endsOn") : t("tenant.renewsOn"),
      <Time key="end" value={sub.current_period_end} date />,
    ]);
    if (sub.trial_ends_at) {
      facts.push([t("tenant.trialEnds"), <Time key="tr" value={sub.trial_ends_at} date />]);
    }
    if (sub.grace_ends_at) {
      facts.push([t("tenant.graceEnds"), <Time key="gr" value={sub.grace_ends_at} date />]);
    }
    if (scheduled) facts.push([t("tenant.scheduled"), scheduled.name]);
  }
  return (
    <section className="block" aria-labelledby="pf-t-sub">
      <div className="block-head">
        <h2 id="pf-t-sub" className="h2">
          {t("tenant.subscription")}
        </h2>
        {sub ? (
          <StatusBadge
            className={SUB_BADGE[status as keyof typeof SUB_BADGE] ?? "badge"}
            label={t.has(`subStatus.${status}`) ? t(`subStatus.${status}`) : status}
          />
        ) : null}
      </div>
      <div className="card padded pf-stack" data-testid="tenant-subscription">
        {sub ? <Facts items={facts} /> : <p className="fhint">{t("subs.noSubscription")}</p>}
        {manage ? (
          <PlanSubscriptionActions tenant={tenant} subscription={sub} plans={plans} />
        ) : null}
        <p className="fhint">
          <Link href="/platform/plans/overrides">{t("tenant.overridesOpen")}</Link>
        </p>
      </div>
      {periods.length > 0 ? (
        <div className="card tcard" data-testid="tenant-periods">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("tenant.periodRange")}</Th>
                <Th className="r">{t("tenant.periodAmount")}</Th>
                <Th>{t("tenant.periodState")}</Th>
                {manage ? (
                  <Th>
                    <span className="vh">{t("tenant.actions")}</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.id}>
                  <Td label={t("tenant.periodRange")}>
                    <Time value={period.period_start} date /> –{" "}
                    <Time value={period.period_end} date />
                  </Td>
                  <Td className="r" label={t("tenant.periodAmount")}>
                    {formatMoney(period.amount.amount, period.amount.currency, locale)}
                  </Td>
                  <Td label={t("tenant.periodState")}>
                    <span className="cell2">
                      <span className={PERIOD_BADGE[period.status] ?? "badge"}>
                        <span className="dot" />
                        {t.has(`periodStatus.${period.status}`)
                          ? t(`periodStatus.${period.status}`)
                          : period.status}
                      </span>
                      {period.provider_reference ? (
                        <span className="sub mono">{period.provider_reference}</span>
                      ) : null}
                    </span>
                  </Td>
                  {manage ? (
                    <Td className="rt-acts">
                      {period.status === "open" ? (
                        <FormDialog
                          action={markPaidAction}
                          label={t("tenant.markPaid")}
                          title={t("tenant.markPaidTitle", { tenant: tenant.name })}
                          points={[t("tenant.markPaidActive")]}
                          submit={t("tenant.markPaid")}
                          done={t("tenant.markPaidDone")}
                          fields={[
                            { kind: "hidden", name: "period_id", value: period.id },
                            {
                              kind: "text",
                              name: "provider_reference",
                              label: t("tenant.paymentReference"),
                              mono: true,
                              hint: t("tenant.paymentReferenceHint"),
                            },
                          ]}
                        />
                      ) : null}
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
      {profile ? (
        <div className="card padded" data-testid="tenant-billing-profile">
          <Facts
            items={[
              [t("tenant.billingName"), profile.legal_name],
              [t("tenant.billingTax"), profile.tax_code ?? "—"],
              [t("tenant.billingEmail"), profile.email],
            ]}
          />
        </div>
      ) : null}
      {usage.length > 0 ? (
        <div className="card padded meters" data-testid="tenant-usage">
          {usage.map((u) => (
            <UsageMeter key={u.key} usage={u} />
          ))}
        </div>
      ) : null}
      <p className="fhint">{t("tenant.usageAbout")}</p>
    </section>
  );
}

const PERIOD_BADGE: Record<string, string> = {
  open: "badge b-warn",
  paid: "badge b-ok",
  void: "badge b-arch",
};

const EXPORT_BADGE: Record<string, string> = {
  pending: "badge b-info",
  running: "badge b-info",
  ready: "badge b-ok",
  failed: "badge b-bad",
  expired: "badge b-arch",
};

/** Xuất toàn bộ dữ liệu của khách: các lượt đã xuất (mới trước), tải tệp đã xong, xuất lượt mới. */
export async function TenantExportSection({ tenant }: { tenant: Tenant }) {
  if (!(await can(TENANTS_OPERATE))) return null;
  const t = await getTranslations("platform");
  const locale = await getLocale();
  let exports: Awaited<ReturnType<typeof listExports>>;
  try {
    exports = await listExports(tenant.id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return null;
    throw error;
  }
  const busy = exports.some((x) => x.status === "pending" || x.status === "running");
  return (
    <section className="block half" aria-labelledby="pf-t-export">
      <h2 id="pf-t-export" className="h2">
        {t("tenant.export")}
      </h2>
      <div className="card padded pf-stack">
        <p className="fhint">{t("tenant.exportAbout")}</p>
        {exports.length > 0 ? (
          <ul className="pf-grants" data-testid="tenant-exports">
            {exports.map((job) => (
              <li key={job.id}>
                <StatusBadge
                  className={EXPORT_BADGE[job.status] ?? "badge"}
                  label={
                    t.has(`exportState.${job.status}`) ? t(`exportState.${job.status}`) : job.status
                  }
                />{" "}
                <Time value={job.created_at} />
                {job.size !== null && job.size !== undefined
                  ? ` · ${formatBytes(job.size, locale)}`
                  : ""}
                {job.reason === "subscription_canceled" ? ` · ${t("tenant.exportAuto")}` : ""}
                {job.status === "ready" ? (
                  <>
                    {" · "}
                    <a href={`/platform/tenants/${tenant.id}/exports/${job.id}`} download>
                      {t("tenant.exportDownload")}
                    </a>
                    {job.expires_at ? (
                      <span className="sub">
                        {" · "}
                        {t("tenant.exportKeep")} <Time value={job.expires_at} date />
                      </span>
                    ) : null}
                  </>
                ) : null}
                {job.status === "failed" && job.error ? (
                  <span className="sub"> · {job.error}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {busy ? <p className="note">{t("tenant.exportBusy")}</p> : null}
        <div className="eg-acts">
          <FormDialog
            action={exportTenantData}
            label={t("tenant.exportButton")}
            title={t("tenant.exportTitle", { tenant: tenant.name })}
            points={[t("tenant.exportAll"), t("tenant.exportPersonal"), t("tenant.exportAudit")]}
            submit={t("tenant.exportSubmit")}
            done={t("tenant.exportDone", { tenant: tenant.name })}
            fields={[{ kind: "hidden", name: "tenant_id", value: tenant.id }]}
          />
        </div>
      </div>
    </section>
  );
}

async function listExports(id: string) {
  return (
    await load((c) => c.GET("/api/v1/kernel/tenants/{id}/exports", { params: { path: { id } } }))
  ).data;
}

/** Quyền vào dữ liệu của khách này: các lần cấp và nút cấp mới. */
export async function TenantSupportSection({ tenant }: { tenant: Tenant }) {
  if (!(await can(SUPPORT_GRANT))) return null;
  const t = await getTranslations("platform");
  const [grants, staff, roles, hours, allowed] = await Promise.all([
    loadGrants(tenant.id),
    loadStaff(),
    allRoles(),
    supportHours(),
    supportAllowed(tenant.id),
  ]);
  if (grants === null) return null;
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id.slice(0, 8);
  return (
    <section className="block half" aria-labelledby="pf-t-access">
      <div className="block-head">
        <h2 id="pf-t-access" className="h2">
          {t("tenant.access")}
        </h2>
        <SupportGrantDialog
          tenants={[{ value: tenant.id, label: tenant.name }]}
          staff={staff}
          roles={roles.map((r) => ({ value: r.id, label: r.name }))}
          hours={hours}
          allowed={allowed !== false}
          triggerClass="btn sm"
        />
      </div>
      <p className="fhint">{t("tenant.accessAbout")}</p>
      {allowed === false ? (
        <p className="note warn" data-testid="support-off">
          {t("tenant.supportOff")}
        </p>
      ) : null}
      <div className="card tcard" data-testid="tenant-grants">
        <SupportGrantTable grants={grants} roleName={roleName} manage />
      </div>
    </section>
  );
}
