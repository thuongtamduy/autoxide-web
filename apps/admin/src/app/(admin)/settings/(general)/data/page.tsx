import { ApiError } from "@autoxide/sdk";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { exportTenantData } from "@/app/(platform)/platform/support-actions";
import { StatusBadge } from "@/components/platform/common";
import { MovePoll } from "@/components/platform/move";
import { FormDialog } from "@/components/ui/form-dialog";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { formatBytes } from "@/lib/format";
import { DATA_EXPORT } from "@/lib/permissions";
import { can, getCurrentTenant } from "@/lib/viewer";

const BADGE: Record<string, string> = {
  pending: "badge b-info",
  running: "badge b-info",
  ready: "badge b-ok",
  failed: "badge b-bad",
  expired: "badge b-arch",
};

// Tab "Dữ liệu của bạn" (`POST/GET /kernel/tenants/{id}/exports` với `kernel.data.export`, bước 33 của
// core): quản trị viên của khách tự xuất toàn bộ dữ liệu của khách mình — một tệp JSON Lines, để giữ
// hay chuyển sang nhà cung cấp khác. Tải tệp qua máy chủ của giao diện (token không xuống trình duyệt).
export default async function DataPage() {
  if (!(await can(DATA_EXPORT))) notFound();
  const [t, tp, locale, tenant] = await Promise.all([
    getTranslations("settings.data"),
    getTranslations("platform"),
    getLocale(),
    getCurrentTenant(),
  ]);
  if (!tenant) notFound();
  let exports: Awaited<ReturnType<typeof listExports>>;
  try {
    exports = await listExports(tenant.id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) notFound();
    throw error;
  }
  const busy = exports.some((x) => x.status === "pending" || x.status === "running");
  return (
    <section className="block" aria-labelledby="data-h">
      <div className="block-head">
        <h2 id="data-h" className="h2">
          {t("title")}
        </h2>
        <FormDialog
          action={exportTenantData}
          label={t("export")}
          triggerClass="btn sm pri"
          title={t("exportTitle")}
          points={[t("exportAll"), t("exportPersonal"), t("exportKeep")]}
          submit={t("exportSubmit")}
          done={t("exportDone")}
          fields={[{ kind: "hidden", name: "tenant_id", value: tenant.id }]}
        />
      </div>
      <p className="fhint">{t("about")}</p>
      {busy ? (
        <>
          <p className="note">{t("busy")}</p>
          <MovePoll />
        </>
      ) : null}
      {exports.length > 0 ? (
        <ul className="card padded pf-grants" data-testid="own-exports">
          {exports.map((job) => (
            <li key={job.id}>
              <StatusBadge
                className={BADGE[job.status] ?? "badge"}
                label={
                  tp.has(`exportState.${job.status}`) ? tp(`exportState.${job.status}`) : job.status
                }
              />{" "}
              <Time value={job.created_at} />
              {job.size !== null && job.size !== undefined
                ? ` · ${formatBytes(job.size, locale)}`
                : ""}
              {job.status === "ready" ? (
                <>
                  {" · "}
                  <a href={`/platform/tenants/${tenant.id}/exports/${job.id}`} download>
                    {t("download")}
                  </a>
                  {job.expires_at ? (
                    <span className="sub">
                      {" · "}
                      {t("keptUntil")} <Time value={job.expires_at} date />
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
      ) : (
        <p className="empty">{t("none")}</p>
      )}
    </section>
  );
}

async function listExports(id: string) {
  return (
    await load((c) => c.GET("/api/v1/kernel/tenants/{id}/exports", { params: { path: { id } } }))
  ).data;
}
