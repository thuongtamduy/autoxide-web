import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { approveAction, rejectAction } from "@/app/(admin)/settings/sample-actions";
import { SampleBadge } from "@/components/sample-badge";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Time } from "@/components/ui/time";
import { getViewer } from "@/lib/viewer";
import { holds } from "@/nav/nav";
import { sampleDataEnabled } from "@/sample";
import { type ApprovalStatus, listApprovals } from "@/sample/agent";

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected", "expired"];
const BADGE: Record<ApprovalStatus, string> = {
  pending: "badge b-warn",
  approved: "badge b-ok",
  rejected: "badge b-arch",
  expired: "badge b-arch",
};

/** Giờ còn lại tới hạn, làm tròn lên; 0 khi đã qua. */
function hoursLeft(expires: string): number {
  return Math.max(0, Math.ceil((Date.parse(expires) - Date.now()) / 3_600_000));
}

// Tab "Chờ duyệt" (dữ liệu mẫu, chờ `/api/v1/kernel/approvals` của bước 51): lệnh rủi ro agent gọi
// không chạy ngay mà thành yêu cầu; người có cùng permission duyệt thì lệnh mới chạy. Chỉ hiện yêu
// cầu người xem duyệt được.
export default async function ApprovalsPage(props: PageProps<"/settings/api-keys/approvals">) {
  if (!sampleDataEnabled()) notFound();
  const t = await getTranslations("settings.approvals");
  const viewer = await getViewer();
  const { status } = await props.searchParams;
  const current = STATUSES.find((s) => s === status) ?? "pending";
  const { data } = await listApprovals({ status: current }, (p) => holds(viewer, p));
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="appr-h">
        <div className="block-head">
          <h2 id="appr-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge
            step="51"
            endpoint="GET /api/v1/kernel/approvals, POST /approvals/{id}/approve, /reject"
          />
        </div>
        <p className="fhint">{t("about")}</p>
        <nav className="chips" aria-label={t("filter")}>
          {STATUSES.map((s) => (
            <Link
              key={s}
              className={current === s ? "chip on" : "chip"}
              href={
                s === "pending"
                  ? "/settings/api-keys/approvals"
                  : `/settings/api-keys/approvals?status=${s}`
              }
              aria-current={current === s ? "page" : undefined}
            >
              {t(`status.${s}`)}
            </Link>
          ))}
        </nav>
        <div className="card">
          {data.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            data.map((request) => {
              const left = hoursLeft(request.expires_at);
              return (
                <div className="item" key={request.id} data-testid="approval">
                  <div className="item-main">
                    <span className="item-title">{request.summary}</span>
                    <span className="item-meta">
                      {request.agent.name} · {request.context} ·{" "}
                      {t("needs", { permission: request.permission })}
                    </span>
                    <details className="visits">
                      <summary>
                        {t("args")} <span className="mono">{request.tool}</span>
                      </summary>
                      <pre className="json mono">{JSON.stringify(request.arguments, null, 2)}</pre>
                    </details>
                    {request.decided_by && request.decided_at ? (
                      <span className="item-meta">
                        {t("decidedBy", { name: request.decided_by.name })}{" "}
                        <Time value={request.decided_at} />
                      </span>
                    ) : null}
                  </div>
                  {request.status === "pending" ? (
                    <>
                      <span className={left <= 3 ? "due bad" : "due"}>
                        {t("expiresIn", { hours: left })}
                      </span>
                      <span className="item-acts">
                        <InlineAction
                          action={rejectAction}
                          id={request.id}
                          label={t("reject")}
                          ariaLabel={t("rejectLabel", { summary: request.summary })}
                          done={t("rejected")}
                        />
                        <ConfirmAction
                          action={approveAction}
                          id={request.id}
                          label={t("approve")}
                          title={t("approveTitle", { summary: request.summary })}
                          points={[
                            request.consequence,
                            t("approveRuns", { agent: request.agent.name, tool: request.tool }),
                            t("approveAudit"),
                          ]}
                          submit={t("approveSubmit")}
                          done={t("approved")}
                          danger={request.risk === "high"}
                        />
                      </span>
                    </>
                  ) : (
                    <span className={BADGE[request.status]}>
                      <span className="dot" />
                      {t(`status.${request.status}`)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
