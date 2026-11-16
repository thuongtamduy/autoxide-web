import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { retryProvisioningAction } from "@/app/(platform)/platform/actions";
import { Chips } from "@/components/engage/common";
import { PlatformHead, PROVISION_BADGE, StatusBadge } from "@/components/platform/common";
import { ProvisionDialog } from "@/components/platform/provision-dialog";
import { InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { oneOf, type SearchParams } from "@/lib/engage";
import { PROVISION } from "@/lib/permissions";
import { listProvisionings } from "@/sample/platform";
import { PROVISION_STEPS, type ProvisionStatus } from "@/sample/platform-data";
import { listPlans } from "@/sample/platform-plans";

const STATUSES: readonly ProvisionStatus[] = ["running", "failed", "done"];
const ENDPOINTS =
  "POST /api/v1/plans/provisionings, GET /api/v1/plans/provisionings/{id}, POST …/{id}/retry (bước 35); mới: GET /api/v1/plans/provisionings?status= (danh sách), lịch sử từng bước";

// Màn "Cấp phát" (dữ liệu mẫu, W-014): mỗi lượt cấp phát chạy từng bước bằng job; lỗi thì dừng ở
// bước đó và chạy lại được từ chính bước đó (ID khách sinh trước, không tạo khách thứ hai).
export default async function ProvisioningPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await sampleGate(PROVISION);
  if (gate) return gate;
  const t = await getTranslations("platform.prov");
  const tp = await getTranslations("platform");
  const status = oneOf(await props.searchParams, "status", STATUSES);
  const [{ data: all }, { data: plans }] = await Promise.all([listProvisionings(), listPlans()]);
  const runs = all.filter((run) => !status || run.status === status);
  const last = PROVISION_STEPS.length - 1;
  return (
    <div className="page">
      <PlatformHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("description")}
        step="35"
        endpoint={ENDPOINTS}
        actions={<ProvisionDialog />}
      />
      <section className="block" aria-labelledby="pf-prov-h">
        <h2 id="pf-prov-h" className="h2">
          {t("listTitle")}
        </h2>
        <p className="fhint">{t("steps")}</p>
        <Chips
          label={t("filter")}
          chips={[
            { href: "/platform/provisioning", label: tp("all"), on: !status, count: all.length },
            ...STATUSES.map((s) => ({
              href: `/platform/provisioning?status=${s}`,
              label: tp(`provStatus.${s}`),
              on: s === status,
              count: all.filter((run) => run.status === s).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("colTenant")}</Th>
                <Th>{t("colPlan")}</Th>
                <Th>{t("colProgress")}</Th>
                <Th>{t("colStatus")}</Th>
                <Th>
                  <span className="vh">{tp("tenant.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const index = PROVISION_STEPS.indexOf(run.step);
                const plan = plans.find((p) => p.id === run.plan_id);
                const stoppedAt =
                  run.status === "failed" ? run.history.find((h) => h.failed)?.step : undefined;
                return (
                  <tr key={run.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        {run.status === "done" || index >= 1 ? (
                          <Link href={`/platform/tenants/${run.tenant_id}`} className="open">
                            {run.tenant_name}
                          </Link>
                        ) : (
                          <b>{run.tenant_name}</b>
                        )}
                        <span className="sub">
                          {run.signup_id ? t("selfSignup") : t("admin", { email: run.admin_email })}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("colPlan")}>
                      <span className="cell2">
                        <span>{plan?.name ?? "—"}</span>
                        <span className="sub">
                          {tp(`placementKind.${run.placement}`)}
                          {run.placement_name ? ` · ${run.placement_name}` : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("colProgress")}>
                      <div className="meter pf-meter compact">
                        <div className="meter-head">
                          <span className="ell">
                            {run.status === "done"
                              ? t("finished", { total: last })
                              : stoppedAt
                                ? t("stoppedAt", { step: t(`step.${stoppedAt}`) })
                                : t("atStep", {
                                    n: index,
                                    total: last,
                                    step: t(`step.${run.step}`),
                                  })}
                          </span>
                        </div>
                        <progress
                          className={run.status === "failed" ? "bar hi" : "bar"}
                          max={last}
                          value={index}
                          aria-label={t("colProgress")}
                        />
                      </div>
                    </Td>
                    <Td label={t("colStatus")}>
                      <StatusBadge
                        className={PROVISION_BADGE[run.status]}
                        label={tp(`provStatus.${run.status}`)}
                      />
                    </Td>
                    <Td className="rt-acts">
                      <div className="eg-acts">
                        {run.status === "failed" ? (
                          <InlineAction
                            action={retryProvisioningAction}
                            id={run.id}
                            label={t("retry")}
                            done={t("retried", { tenant: run.tenant_name })}
                          />
                        ) : null}
                      </div>
                      <details className="visits">
                        <summary>{t("history")}</summary>
                        {run.last_error ? (
                          <p className="note warn">{t("error", { error: run.last_error })}</p>
                        ) : null}
                        {run.status === "failed" ? <p className="fhint">{t("fix")}</p> : null}
                        <ul>
                          {run.history.map((h) => (
                            <li key={`${h.at}${h.step}${h.failed ? "x" : ""}`}>
                              <Time value={h.at} /> ·{" "}
                              {h.failed
                                ? t("failedStep", { step: t(`step.${h.step}`) })
                                : t(`step.${h.step}`)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {runs.length === 0 ? <p className="empty">{t("none")}</p> : null}
        </div>
      </section>
    </div>
  );
}
