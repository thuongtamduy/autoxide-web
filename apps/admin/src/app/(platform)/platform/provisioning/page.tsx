import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { retryProvision } from "@/app/(platform)/platform/provision-actions";
import { Chips } from "@/components/engage/common";
import { PlatformHead, StatusBadge } from "@/components/platform/common";
import { MovePoll } from "@/components/platform/move";
import { ProvisionDialog } from "@/components/platform/provision-dialog";
import { InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { oneOf, type SearchParams } from "@/lib/engage";
import { PROVISION } from "@/lib/permissions";
import { loadAllPlans } from "@/lib/plans-server";
import { platformGate, platformRefused } from "@/lib/platform-server";
import { can } from "@/lib/viewer";

const STATUSES = ["pending", "running", "failed", "done"] as const;
/** Các bước của một lượt cấp phát theo thứ tự (D-338 của core). */
const STEPS = ["created", "tenant_created", "subscribed", "seeded", "invited", "done"] as const;
const BADGE: Record<string, string> = {
  pending: "badge b-info",
  running: "badge b-info",
  failed: "badge b-bad",
  done: "badge b-ok",
};

// Màn "Cấp phát" (`/plans/provisionings`, D-338 của core): mỗi lượt tạo khách trên một gói chạy nền
// từng bước (tạo khách → gán gói → dữ liệu mẫu → mời quản trị viên); hỏng thì dừng ở bước đó, sửa rồi
// chạy lại từ bước đã ghi (không tạo khách thứ hai). Trang tự làm mới khi còn lượt đang chạy.
export default async function ProvisioningPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await platformGate(PROVISION);
  if (gate) return gate;
  const t = await getTranslations("platform.prov");
  const tp = await getTranslations("platform");
  const status = oneOf(await props.searchParams, "status", STATUSES);
  let all: Awaited<ReturnType<typeof loadRuns>>;
  try {
    all = await loadRuns();
  } catch (error) {
    const refused = await platformRefused(error);
    if (refused) return refused;
    throw error;
  }
  const [plans, provision] = await Promise.all([loadAllPlans(), can(PROVISION)]);
  const runs = all.filter((run) => !status || run.status === status);
  const last = STEPS.length - 1;
  const busy = all.some((run) => run.status === "pending" || run.status === "running");
  return (
    <div className="page">
      <PlatformHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("descriptionCore")}
        actions={provision ? <ProvisionDialog /> : undefined}
      />
      {busy ? <MovePoll /> : null}
      <section className="block" aria-labelledby="pf-prov-h">
        <h2 id="pf-prov-h" className="h2">
          {t("listTitle")}
        </h2>
        <p className="fhint">{t("stepsCore")}</p>
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
        <div className="card tcard" data-testid="provisionings">
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
                const index = Math.max(0, STEPS.indexOf(run.step as (typeof STEPS)[number]));
                const plan = plans.find((p) => p.id === run.plan_id);
                const stepName = (step: string) =>
                  t.has(`step.${step}`) ? t(`step.${step}`) : step;
                return (
                  <tr key={run.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        {run.tenant_id ? (
                          <Link href={`/platform/tenants/${run.tenant_id}`} className="open">
                            {run.tenant_name}
                          </Link>
                        ) : (
                          <b>{run.tenant_name}</b>
                        )}
                        <span className="sub">
                          <span className="mono">{run.slug}</span> ·{" "}
                          {t("admin", { email: run.admin_email })}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("colPlan")}>
                      <span className="cell2">
                        <span>{plan?.name ?? "—"}</span>
                        <span className="sub mono">{run.placement ?? "main"}</span>
                      </span>
                    </Td>
                    <Td label={t("colProgress")}>
                      <div className="meter pf-meter compact">
                        <div className="meter-head">
                          <span className="ell">
                            {run.status === "done"
                              ? t("finished", { total: last })
                              : run.status === "failed"
                                ? t("stoppedAfter", { step: stepName(run.step) })
                                : t("atStep", { n: index, total: last, step: stepName(run.step) })}
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
                        className={BADGE[run.status] ?? "badge"}
                        label={
                          tp.has(`provStatus.${run.status}`)
                            ? tp(`provStatus.${run.status}`)
                            : run.status
                        }
                      />
                    </Td>
                    <Td className="rt-acts">
                      <div className="eg-acts">
                        {run.status === "failed" && provision ? (
                          <InlineAction
                            action={retryProvision}
                            id={run.id}
                            label={t("retry")}
                            done={t("retried", { tenant: run.tenant_name })}
                          />
                        ) : null}
                      </div>
                      <details className="visits">
                        <summary>{t("history")}</summary>
                        {run.error ? (
                          <p className="note warn">
                            {t("error", { error: run.error })}
                            {run.error_code ? (
                              <span className="sub mono"> · {run.error_code}</span>
                            ) : null}
                          </p>
                        ) : null}
                        <ul>
                          {run.steps.map((h) => (
                            <li key={`${h.at}${h.step}`}>
                              <Time value={h.at} /> · {stepName(h.step)}
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

/** Mọi lượt cấp phát, mới trước (tối đa 10 trang × 200). */
async function loadRuns() {
  const all = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const answer = await load((c) =>
      c.GET("/api/v1/plans/provisionings", {
        params: { query: { limit: 200, order: "desc", ...(cursor ? { cursor } : {}) } },
      }),
    );
    all.push(...answer.data);
    cursor = answer.pagination.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return all;
}
