import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { SampleBadge } from "@/components/sample-badge";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatCount } from "@/lib/format";
import { DEVTOOLS_READ } from "@/lib/permissions";
import { type JobStatus, listJobs } from "@/sample/settings";
import { retryJobAction } from "../../sample-actions";

const STATUSES: JobStatus[] = ["running", "retrying", "dead", "done"];
const BADGE: Record<JobStatus, string> = {
  running: "badge b-info",
  retrying: "badge b-warn",
  dead: "badge b-bad",
  done: "badge b-ok",
};

// Tab "Job" (dữ liệu mẫu, chờ bàn kỹ thuật của bước 52): việc chạy nền của khách, tiến độ, lỗi,
// dead-letter queue và chạy lại. Core hiện chỉ có lệnh CLI `autoxide jobs` cho nhà vận hành.
export default async function JobsPage(props: PageProps<"/settings/jobs">) {
  const gate = await sampleGate(DEVTOOLS_READ);
  if (gate) return gate;
  const t = await getTranslations("settings.jobs");
  const locale = await getLocale();
  const { status } = await props.searchParams;
  const current = STATUSES.find((s) => s === status);
  const [page, all] = await Promise.all([
    listJobs(current ? { status: current } : {}),
    listJobs({ limit: 200 }),
  ]);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="jobs-h">
        <div className="block-head">
          <h2 id="jobs-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="52" endpoint="GET /api/v1/kernel/jobs, POST /jobs/{id}/retry" />
        </div>
        <p className="fhint">{t("about")}</p>
        <nav className="chips" aria-label={t("filter")}>
          <Link
            className={current ? "chip" : "chip on"}
            href="/settings/jobs"
            aria-current={current ? undefined : "page"}
          >
            {t("all")} <span className="cnt">{all.data.length}</span>
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              className={current === s ? "chip on" : "chip"}
              href={`/settings/jobs?status=${s}`}
              aria-current={current === s ? "page" : undefined}
            >
              {t(`status.${s}`)}{" "}
              <span className="cnt">{all.data.filter((j) => j.status === s).length}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("job")}</Th>
                  <Th>{t("started")}</Th>
                  <Th>{t("progress")}</Th>
                  <Th>{t("state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((job) => {
                  const p = job.progress;
                  return (
                    <tr key={job.id}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <b>{job.title}</b>
                          <span className="sub">
                            <span className="mono">{job.kind}</span> ·{" "}
                            {job.requested_by?.name ?? t("system")}
                          </span>
                          {job.last_error ? <span className="sub">{job.last_error}</span> : null}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap" label={t("started")}>
                        <Time value={job.started_at} />
                      </Td>
                      <Td label={t("progress")}>
                        <span className="cell2">
                          <span className="sub">
                            {job.status === "retrying"
                              ? t("attempt", { n: job.attempts, max: job.max_attempts })
                              : p
                                ? p.total
                                  ? t("of", {
                                      done: formatCount(p.done, locale),
                                      total: formatCount(p.total, locale),
                                      unit: t(`units.${p.unit}`),
                                    })
                                  : `${formatCount(p.done, locale)} ${t(`units.${p.unit}`)}`
                                : "—"}
                          </span>
                          {p ? (
                            <progress
                              className="bar"
                              max={p.total ?? 1}
                              value={p.total ? p.done : 1}
                              aria-label={t("progress")}
                            />
                          ) : null}
                        </span>
                      </Td>
                      <Td label={t("state")}>
                        <span className={BADGE[job.status]}>
                          <span className="dot" />
                          {t(`status.${job.status}`)}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        {job.status === "dead" ? (
                          <ConfirmAction
                            action={retryJobAction}
                            id={job.id}
                            label={t("retry")}
                            title={t("retryTitle", { job: job.title })}
                            points={[t("retryFrom"), t("retryAudit")]}
                            submit={t("retrySubmit")}
                            done={t("retried")}
                            danger={false}
                          />
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
