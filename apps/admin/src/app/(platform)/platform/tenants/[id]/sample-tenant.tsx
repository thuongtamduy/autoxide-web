import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import {
  confirmMove,
  exportTenant,
  grantAccess,
  planMove,
  reactivateTenant,
  removeOverrideAction,
  restoreOverrideAction,
  setOverrideAction,
  suspendTenant,
  undoOverrideAction,
} from "@/app/(platform)/platform/actions";
import { ConfirmButton } from "@/components/engage/actions";
import { Back, Facts } from "@/components/engage/common";
import {
  GRANT_BADGE,
  PlatformHead,
  SCHEMA_BADGE,
  StatusBadge,
  SUB_BADGE,
  TENANT_BADGE,
  UsageMeter,
} from "@/components/platform/common";
import { SubscriptionActions } from "@/components/platform/subscription-actions";
import { InlineAction } from "@/components/ui/confirm";
import { FormDialog, InlineForm } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatBytes, formatMoney } from "@/lib/format";
import { initialsOf } from "@/lib/initials";
import {
  SUBSCRIPTIONS_MANAGE,
  SUPPORT_GRANT,
  TENANTS_MANAGE,
  TENANTS_READ,
} from "@/lib/permissions";
import { can } from "@/lib/viewer";
import {
  getDryRuns,
  getTenant,
  listExports,
  listGrants,
  listPlacements,
  listTenants,
  platformGrantStatus,
  SUPPORT_MAX_HOURS,
  supportEnabled,
} from "@/sample/platform";
import { SAMPLE_TENANT_ID, STAFF, SUPPORT_ROLES } from "@/sample/platform-data";
import {
  getTenantSubscription,
  getUsage,
  listHistory,
  listOverrides,
  listPeriods,
  listPlans,
  moduleAccess,
} from "@/sample/platform-plans";

const ENDPOINTS =
  "GET/PATCH /api/v1/kernel/tenants/{id} (bước 33); GET /api/v1/plans/tenants/{id}/subscription, …/usage, …/overrides (bước 35); GET/POST /api/v1/auth/support-grants (bước 34); mới: POST /api/v1/kernel/tenants/{id}/move, …/exports";

// Chi tiết một khách CHỈ có trong dữ liệu mẫu (W-014; vd khách vừa "cấp phát" bằng luồng mẫu của
// bước 35): vị trí dữ liệu và dời khách, thuê bao, hạn mức, module bật cho khách, cây khách, vào dữ
// liệu để hỗ trợ, xuất dữ liệu, tạm khoá hẳn. Khách có ở core dùng `core-tenant.tsx` (W-027).
export async function SampleTenant({ id }: { id: string }) {
  const gate = await sampleGate(TENANTS_READ);
  if (gate) return gate;
  const found = await getTenant(id);
  if (!found) notFound();
  const tenant = found.data;
  const t = await getTranslations("platform");
  const locale = await getLocale();
  const [
    { data: placements },
    { data: tenants },
    subscription,
    { data: usage },
    { data: plans },
    { data: periods },
    { data: history },
    { data: modules },
    { data: overrides },
    { data: grants },
    { data: exports },
    { data: dryRuns },
    support,
  ] = await Promise.all([
    listPlacements(),
    listTenants(),
    getTenantSubscription(id),
    getUsage(id),
    listPlans(),
    listPeriods({ tenant_id: id }),
    listHistory(id),
    moduleAccess(id),
    listOverrides(id),
    listGrants({ tenant_id: id }),
    listExports(id),
    getDryRuns(),
    supportEnabled(id),
  ]);
  const [manage, subsManage, grant] = await Promise.all([
    can(TENANTS_MANAGE),
    can(SUBSCRIPTIONS_MANAGE),
    can(SUPPORT_GRANT),
  ]);
  const placement = placements.find((p) => p.id === tenant.placement_id) ?? null;
  const plan = plans.find((p) => p.id === subscription?.plan_id) ?? null;
  const price = plan?.prices.find((p) => p.id === subscription?.price_id) ?? null;
  const parent = tenants.find((x) => x.id === tenant.parent_id) ?? null;
  const children = tenants.filter((x) => x.parent_id === tenant.id);
  const ready = !tenant.is_platform && tenant.status !== "provisioning";
  const plannedMove = dryRuns.moves[tenant.id];
  const moveTargets = placements.filter(
    (p) => p.kind === "shared" && !p.control && p.id !== tenant.placement_id,
  );
  const moduleName = (m: string) => (t.has(`moduleNames.${m}`) ? t(`moduleNames.${m}`) : m);
  const subFacts: [string, ReactNode][] = [];
  if (subscription) {
    subFacts.push([t("tenant.plan"), plan?.name ?? "—"]);
    subFacts.push([
      t("tenant.price"),
      price
        ? t("price", {
            amount: formatMoney(price.amount_minor, price.amount_currency, locale),
            interval: t(`interval.${price.interval}`),
          })
        : "—",
    ]);
    subFacts.push([
      t("tenant.period"),
      <span key="p">
        <Time value={subscription.current_period_start} date /> –{" "}
        <Time value={subscription.current_period_end} date />
      </span>,
    ]);
    if (subscription.trial_ends_at) {
      subFacts.push([
        t("tenant.trialEnds"),
        <Time key="tr" value={subscription.trial_ends_at} date />,
      ]);
    }
    if (subscription.grace_ends_at && subscription.status === "past_due") {
      subFacts.push([
        t("tenant.graceEnds"),
        <Time key="g" value={subscription.grace_ends_at} date />,
      ]);
    }
    if (subscription.delete_after) {
      subFacts.push([
        t("tenant.deleteAfter"),
        <Time key="d" value={subscription.delete_after} date />,
      ]);
    }
    subFacts.push([
      t("tenant.addons"),
      subscription.addons.length > 0
        ? subscription.addons
            .map(
              (a) => `${plans.find((p) => p.id === a.plan_id)?.name ?? a.plan_id} × ${a.quantity}`,
            )
            .join(", ")
        : "—",
    ]);
  }
  const reasonField = (name = "reason") =>
    ({ kind: "textarea", name, label: t("reason"), hint: t("reasonHint") }) as const;

  return (
    <div className="page">
      <Back href="/platform" label={t("tenant.back")} />
      <PlatformHead
        crumb={t("tenant.crumb", { slug: tenant.slug })}
        title={tenant.name}
        description={t("tenant.description")}
        step="33"
        endpoint={ENDPOINTS}
      />

      <section className="block" aria-labelledby="pf-t-sum">
        <div className="block-head pf-who">
          <span className="tav" aria-hidden="true">
            {tenant.is_platform ? "AX" : initialsOf(tenant.name)}
          </span>
          <h2 id="pf-t-sum" className="h2">
            {t("tenant.summary")}
          </h2>
          <StatusBadge
            className={TENANT_BADGE[tenant.status]}
            label={t(`tenantStatus.${tenant.status}`)}
          />
          {subscription ? (
            <StatusBadge
              className={SUB_BADGE[subscription.status]}
              label={t(`subStatus.${subscription.status}`)}
            />
          ) : null}
        </div>
        <div className="card padded">
          <Facts
            items={[
              [
                t("tenant.model"),
                tenant.business_model
                  ? t(`models.${tenant.business_model}`)
                  : t("tenants.platformTenant"),
              ],
              [t("tenant.plan"), plan?.name ?? "—"],
              [
                t("tenant.slug"),
                <span className="mono" key="slug">
                  {tenant.slug}
                </span>,
              ],
              [t("tenant.domain"), tenant.primary_domain ?? "—"],
              [t("tenant.created"), <Time key="c" value={tenant.created_at} date />],
              [
                t("tenant.id"),
                <span className="mono sub-id" key="id">
                  {tenant.id}
                </span>,
              ],
            ]}
          />
          {tenant.status === "suspended" && tenant.status_reason ? (
            <p className="note warn">
              {t("tenant.suspendedBecause", { reason: tenant.status_reason })}
            </p>
          ) : null}
          {tenant.status === "provisioning" ? (
            <p className="note">
              {t("tenant.provisioning")}{" "}
              <Link href="/platform/provisioning">{t("tenant.provisioningOpen")}</Link>
            </p>
          ) : null}
          {tenant.is_platform ? <p className="note">{t("tenant.platformNote")}</p> : null}
        </div>
      </section>

      <div className="blocks">
        <section className="block half" aria-labelledby="pf-t-place">
          <h2 id="pf-t-place" className="h2">
            {t("tenant.place")}
          </h2>
          <div className="card padded pf-stack">
            {placement ? (
              <>
                <Facts
                  items={[
                    [t("tenant.placeKind"), t(`placementKind.${placement.kind}`)],
                    [
                      t("tenant.placement"),
                      <span className="mono" key="p">
                        {placement.name}
                      </span>,
                    ],
                    [t("tenant.backend"), t(`backend.${placement.backend}`)],
                    [t("tenant.location"), placement.location],
                    [
                      t("tenant.schema"),
                      <StatusBadge
                        key="s"
                        className={SCHEMA_BADGE[placement.schema_state]}
                        label={t(`schema.${placement.schema_state}`)}
                      />,
                    ],
                  ]}
                />
                {placement.schema_state === "behind" ? (
                  <p className="note warn">
                    {t("tenant.behind", { list: placement.pending_migrations.join(", ") })}{" "}
                    <Link href="/platform/fleet">{t("tenant.fleetOpen")}</Link>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="muted">{t("tenants.preparing")}</p>
            )}
            <p className="fhint">{t("tenant.placeAbout")}</p>
            {tenant.status === "moving" ? <p className="note">{t("tenant.moving")}</p> : null}
            {ready && manage && tenant.status === "active" ? (
              <div className="eg-acts">
                <FormDialog
                  action={planMove}
                  label={
                    placement?.kind === "dedicated"
                      ? t("tenant.move.toShared")
                      : t("tenant.move.toDedicated")
                  }
                  title={t("tenant.move.title", { tenant: tenant.name })}
                  intro={t("tenant.move.intro")}
                  submit={t("tenant.move.dryRun")}
                  done={t("tenant.move.dryRunDone")}
                  fields={[
                    { kind: "hidden", name: "tenant_id", value: tenant.id },
                    {
                      kind: "select",
                      name: "to",
                      label: t("tenant.move.to"),
                      defaultValue:
                        placement?.kind === "dedicated" ? (moveTargets[0]?.id ?? "") : "dedicated",
                      options: [
                        ...(placement?.kind === "dedicated"
                          ? []
                          : [
                              {
                                value: "dedicated",
                                label: t("tenant.move.dedicated", { slug: tenant.slug }),
                              },
                            ]),
                        ...moveTargets.map((p) => ({
                          value: p.id,
                          label: t("tenant.move.shared", { name: p.name }),
                        })),
                      ],
                    },
                  ]}
                />
              </div>
            ) : null}
            {plannedMove && tenant.status === "active" ? (
              <div className="note pf-plan-note">
                <p>
                  {t("tenant.move.planned", {
                    from: plannedMove.from,
                    to: plannedMove.to,
                    tables: plannedMove.tables,
                    rows: plannedMove.rows,
                    minutes: Math.ceil(plannedMove.read_only_seconds / 60),
                  })}
                </p>
                {manage ? (
                  <ConfirmButton
                    action={confirmMove}
                    fields={{ id: tenant.id }}
                    label={t("tenant.move.run")}
                    title={t("tenant.move.runTitle", { tenant: tenant.name, to: plannedMove.to })}
                    points={[
                      t("tenant.move.runReadOnly", {
                        minutes: Math.ceil(plannedMove.read_only_seconds / 60),
                      }),
                      t("tenant.move.runCopy"),
                      t("tenant.move.runSource"),
                    ]}
                    submit={t("tenant.move.runSubmit")}
                    done={t("tenant.move.runDone", { tenant: tenant.name })}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="block half" aria-labelledby="pf-t-tree">
          <h2 id="pf-t-tree" className="h2">
            {t("tenant.tree")}
          </h2>
          <div className="card padded pf-stack">
            <Facts
              items={[
                [
                  t("tenant.parent"),
                  parent ? (
                    <Link key="p" href={`/platform/tenants/${parent.id}`}>
                      {parent.name}
                    </Link>
                  ) : (
                    t("tenant.noParent")
                  ),
                ],
                [t("tenant.childCount"), String(children.length)],
              ]}
            />
            {children.length > 0 ? (
              <ul className="pf-children">
                {children.map((child) => {
                  const where = placements.find((p) => p.id === child.placement_id);
                  return (
                    <li key={child.id}>
                      <Link href={`/platform/tenants/${child.id}`}>{child.name}</Link>{" "}
                      <span className="fhint">
                        {where
                          ? `${t(`placementKind.${where.kind}`)} · ${where.name}`
                          : t("tenants.preparing")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <p className="fhint">{t("tenant.treeAbout")}</p>
          </div>
        </section>
      </div>

      {subscription ? (
        <section className="block" aria-labelledby="pf-t-sub">
          <div className="block-head">
            <h2 id="pf-t-sub" className="h2">
              {t("tenant.subscription")}
            </h2>
            <StatusBadge
              className={SUB_BADGE[subscription.status]}
              label={t(`subStatus.${subscription.status}`)}
            />
          </div>
          <div className="card padded pf-stack">
            <Facts items={subFacts} />
            {periods
              .filter((p) => p.status === "open")
              .map((p) => (
                <p key={p.id} className="note warn">
                  {t("tenant.openPeriod", {
                    amount: formatMoney(p.amount_minor, p.amount_currency, locale),
                  })}{" "}
                  {p.due_at ? <Time value={p.due_at} date /> : null}
                </p>
              ))}
            {subsManage ? (
              <SubscriptionActions
                tenant={tenant}
                subscription={subscription}
                periods={periods}
                plans={plans}
              />
            ) : null}
            {history.length > 0 ? (
              <>
                <h3 className="cap">{t("tenant.history")}</h3>
                <ol className="timeline">
                  {history.map((event) => (
                    <li key={`${event.at}${event.text}`}>
                      <Time value={event.at} />
                      <span className="sub">
                        {t(`historyText.${event.text}`)}
                        {event.from && event.to
                          ? ` · ${t(`subStatus.${event.from}`)} → ${t(`subStatus.${event.to}`)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {usage.length > 0 ? (
        <section className="block" aria-labelledby="pf-t-use">
          <h2 id="pf-t-use" className="h2">
            {t("tenant.usage")}
          </h2>
          <div className="card padded meters">
            {usage.map((u) => (
              <UsageMeter key={u.key} usage={u} />
            ))}
          </div>
          <p className="fhint">{t("tenant.usageAbout")}</p>
        </section>
      ) : null}

      {subscription ? (
        <section className="block" aria-labelledby="pf-t-mod">
          <h2 id="pf-t-mod" className="h2">
            {t("tenant.modules", {
              on: modules.filter((m) => m.enabled).length,
              all: modules.length,
            })}
          </h2>
          <p className="fhint">{t("tenant.modulesAbout")}</p>
          <div className="card tcard">
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("tenant.module")}</Th>
                  <Th>{t("tenant.moduleState")}</Th>
                  <Th>
                    <span className="vh">{t("tenant.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.module}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{moduleName(m.module)}</b>
                        <span className="sub mono">{m.module}</span>
                      </span>
                    </Td>
                    <Td label={t("tenant.moduleState")}>
                      <span className="cell2">
                        <StatusBadge
                          className={m.enabled ? "badge b-ok" : "badge b-arch"}
                          label={m.enabled ? t("tenant.moduleOn") : t("tenant.moduleOff")}
                        />
                        {m.override ? (
                          <span className="sub">
                            {m.enabled && !m.in_plan ? t("tenant.extra") : t("tenant.overridden")}:{" "}
                            {m.override.reason}
                          </span>
                        ) : (
                          <span className="sub">
                            {m.in_plan ? t("tenant.inPlan") : t("tenant.notInPlan")}
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      {subsManage ? (
                        <div className="eg-acts">
                          <FormDialog
                            action={setOverrideAction}
                            label={m.enabled ? t("tenant.turnOff") : t("tenant.turnOn")}
                            title={t(m.enabled ? "tenant.turnOffTitle" : "tenant.turnOnTitle", {
                              module: moduleName(m.module),
                              tenant: tenant.name,
                            })}
                            points={
                              m.enabled
                                ? [t("tenant.offBlocks"), t("tenant.offKeeps")]
                                : [t("tenant.onExtra"), t("tenant.onBilling")]
                            }
                            submit={m.enabled ? t("tenant.turnOff") : t("tenant.turnOn")}
                            done={t(m.enabled ? "tenant.turnedOff" : "tenant.turnedOn", {
                              module: m.module,
                            })}
                            undoAction={undoOverrideAction}
                            undoLabel={t("undo")}
                            undoDone={t("undone")}
                            fields={[
                              { kind: "hidden", name: "tenant_id", value: tenant.id },
                              { kind: "hidden", name: "kind", value: "module" },
                              { kind: "hidden", name: "key", value: m.module },
                              { kind: "hidden", name: "value", value: m.enabled ? "off" : "on" },
                              {
                                kind: "date",
                                name: "expires_on",
                                label: t("expiresOn"),
                                hint: t("expiresHint"),
                              },
                              reasonField(),
                            ]}
                          />
                          {m.override ? (
                            <RemoveOverride id={m.override.id} label={t("tenant.dropOverride")} />
                          ) : null}
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          {overrides.filter((o) => o.kind !== "module").length > 0 ? (
            <p className="fhint">
              {t("tenant.otherOverrides", {
                count: overrides.filter((o) => o.kind !== "module").length,
              })}{" "}
              <Link href="/platform/plans/overrides">{t("tenant.overridesOpen")}</Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {ready ? (
        <div className="blocks">
          <section className="block half" aria-labelledby="pf-t-access">
            <h2 id="pf-t-access" className="h2">
              {t("tenant.access")}
            </h2>
            <div className="card padded pf-stack">
              <p className="fhint">{t("tenant.accessAbout")}</p>
              <p className={support ? "note" : "note warn"}>
                {support ? t("tenant.supportOn") : t("tenant.supportOff")}
                {tenant.id === SAMPLE_TENANT_ID ? (
                  <>
                    {" "}
                    <Link href="/org/access/support">{t("tenant.tenantView")}</Link>
                  </>
                ) : null}
              </p>
              {grants.length > 0 ? (
                <ul className="pf-grants">
                  {grants.slice(0, 4).map((g) => {
                    const state = platformGrantStatus(g);
                    return (
                      <li key={g.id}>
                        <StatusBadge
                          className={GRANT_BADGE[state]}
                          label={t(`grantStatus.${state}`)}
                        />{" "}
                        <b>{g.staff.name}</b> · {g.reason} · <Time value={g.expires_at} />
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {grant ? (
                <InlineForm
                  action={grantAccess}
                  submit={t("support.submit")}
                  done={t("support.done", { tenant: tenant.name })}
                  fields={[
                    { kind: "hidden", name: "tenant_id", value: tenant.id },
                    {
                      kind: "select",
                      name: "staff_user_id",
                      label: t("support.staff"),
                      defaultValue: STAFF.vy.id,
                      options: Object.values(STAFF).map((s) => ({ value: s.id, label: s.name })),
                    },
                    {
                      kind: "select",
                      name: "role_id",
                      label: t("support.role"),
                      options: SUPPORT_ROLES.map((r) => ({ value: r.id, label: r.name })),
                    },
                    {
                      kind: "select",
                      name: "basis",
                      label: t("support.basis"),
                      defaultValue: support ? "support" : "legal_request",
                      options: [
                        { value: "support", label: t("basis.support") },
                        { value: "legal_request", label: t("basis.legal_request") },
                      ],
                    },
                    {
                      kind: "select",
                      name: "hours",
                      label: t("support.hours"),
                      defaultValue: "4",
                      options: [1, 4, SUPPORT_MAX_HOURS].map((h) => ({
                        value: String(h),
                        label: t("support.hoursOption", { count: h }),
                      })),
                    },
                    {
                      kind: "text",
                      name: "legal_reference",
                      label: t("support.legal"),
                      mono: true,
                      hint: t("support.legalHint"),
                    },
                    {
                      kind: "textarea",
                      name: "reason",
                      label: t("reason"),
                      hint: t("support.reasonHint"),
                    },
                  ]}
                />
              ) : null}
            </div>
          </section>

          <section className="block half" aria-labelledby="pf-t-export">
            <h2 id="pf-t-export" className="h2">
              {t("tenant.export")}
            </h2>
            <div className="card padded pf-stack">
              <p className="fhint">{t("tenant.exportAbout")}</p>
              {exports.length > 0 ? (
                <ul className="pf-grants">
                  {exports.map((job) => (
                    <li key={job.id}>
                      <StatusBadge
                        className={
                          job.status === "done"
                            ? "badge b-ok"
                            : job.status === "failed"
                              ? "badge b-bad"
                              : "badge b-info"
                        }
                        label={t(`exportStatus.${job.status}`)}
                      />{" "}
                      <Time value={job.created_at} />
                      {job.size_bytes ? ` · ${formatBytes(job.size_bytes, locale)}` : ""}
                      {job.expires_at ? (
                        <>
                          {" · "}
                          {t("tenant.exportKeep")} <Time value={job.expires_at} date />
                        </>
                      ) : null}
                      <span className="sub"> · {job.requested_by.name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {manage ? (
                <div className="eg-acts">
                  <FormDialog
                    action={exportTenant}
                    label={t("tenant.exportButton")}
                    title={t("tenant.exportTitle", { tenant: tenant.name })}
                    points={[
                      t("tenant.exportAll"),
                      t("tenant.exportPersonal"),
                      t("tenant.exportKeepDays"),
                      t("tenant.exportAudit"),
                    ]}
                    submit={t("tenant.exportSubmit")}
                    done={t("tenant.exportDone", { tenant: tenant.name })}
                    fields={[
                      { kind: "hidden", name: "tenant_id", value: tenant.id },
                      reasonField(),
                    ]}
                  />
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {ready && manage ? (
        <section className="block pf-danger" aria-labelledby="pf-t-danger">
          <h2 id="pf-t-danger" className="h2">
            {t("tenant.danger")}
          </h2>
          <div className="card padded pf-stack">
            {tenant.status === "suspended" ? (
              <>
                <p>{t("tenant.suspendedNow")}</p>
                <div className="eg-acts">
                  <InlineAction
                    action={reactivateTenant}
                    id={tenant.id}
                    label={t("tenant.reactivate")}
                    done={t("tenant.reactivated", { tenant: tenant.name })}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="fhint">{t("tenant.suspendAbout")}</p>
                <div className="eg-acts">
                  <FormDialog
                    action={suspendTenant}
                    label={t("tenant.suspend")}
                    triggerClass="btn sm danger"
                    danger
                    title={t("tenant.suspendTitle", { tenant: tenant.name })}
                    points={[
                      t("tenant.suspendStops"),
                      t("tenant.suspendNotReadOnly"),
                      t("tenant.suspendAudit"),
                      t("tenant.suspendUndo"),
                    ]}
                    submit={t("tenant.suspendSubmit")}
                    done={t("tenant.suspended", { tenant: tenant.name })}
                    fields={[
                      { kind: "hidden", name: "tenant_id", value: tenant.id },
                      reasonField(),
                      {
                        kind: "check",
                        name: "acknowledged",
                        label: t("tenant.suspendAck", { tenant: tenant.name }),
                      },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** "Bỏ ghi đè" của một module: hỏi lại, xong thì báo kèm Hoàn tác (đặt lại đúng ghi đè cũ). */
async function RemoveOverride({ id, label }: { id: string; label: string }) {
  const t = await getTranslations("platform");
  return (
    <FormDialog
      action={removeOverrideAction}
      label={label}
      title={t("tenant.dropTitle")}
      points={[t("tenant.dropBack")]}
      submit={label}
      done={t("tenant.dropped")}
      undoAction={restoreOverrideAction}
      undoLabel={t("undo")}
      undoDone={t("undone")}
      fields={[{ kind: "hidden", name: "id", value: id }]}
    />
  );
}
