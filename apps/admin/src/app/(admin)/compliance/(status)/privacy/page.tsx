import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { incidentStep, openIncidentAction } from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis, TimeLeft } from "@/components/compliance/common";
import { ConfirmButton } from "@/components/engage/actions";
import { TipHeading } from "@/components/help/info-tip";
import { FormDialog } from "@/components/ui/form-dialog";
import { Time } from "@/components/ui/time";
import { INCIDENTS_MANAGE, PRIVACY_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { INCIDENT_CATEGORIES, listIncidents } from "@/sample/compliance";
import { listSubjectRequests, selfServiceStats } from "@/sample/compliance-records";
import { ruleAt } from "@/sample/compliance-rules";

// Tab "Dữ liệu cá nhân": quy trình sự cố 72 giờ (đếm từ lúc phát hiện, hạn và mốc nhắc là dữ liệu
// của bộ quy định) và tóm tắt yêu cầu của chủ thể dữ liệu (xử lý ở màn Hồ sơ và dữ liệu cá nhân).
export default async function PrivacyTab() {
  const gate = await sampleGate(PRIVACY_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.privacy");
  const [{ data: incidents }, { data: requests }, { data: self }, manage] = await Promise.all([
    listIncidents(),
    listSubjectRequests(),
    selfServiceStats(),
    can(INCIDENTS_MANAGE),
  ]);
  const open = incidents.find((i) => i.status !== "closed");
  const past = incidents.filter((i) => i.status === "closed");
  const waiting = requests.filter((r) => !["done", "rejected"].includes(r.status));
  const hours =
    ruleAt<{ report_within_hours: number }>("privacy.incident")?.body.report_within_hours ?? 72;
  const step = (name: string, label: string, done: string, points: string[]) =>
    open ? (
      <ConfirmButton
        action={incidentStep}
        fields={{ id: open.id, step: name }}
        label={label}
        title={label}
        points={points}
        submit={label}
        done={done}
        danger={name === "close"}
      />
    ) : null;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="cp-inc-h">
        <div className="block-head">
          <TipHeading id="cp-inc-h" tip="incident">
            {t("incident.title")}
          </TipHeading>
        </div>
        <p className="fhint">{t("incident.about", { hours })}</p>
        {open ? (
          <section className="card cp-incident" aria-label={open.reference}>
            <div className="block-head">
              <b className="mono">{open.reference}</b>
              <span className="badge b-bad">
                <span className="dot" />
                {t(`incident.status.${open.status}`)}
              </span>
              {open.authority_notified_at ? null : <TimeLeft until={open.report_due_at} />}
            </div>
            <p>{open.description}</p>
            <dl className="eg-facts">
              <div>
                <dt>{t("incident.detected")}</dt>
                <dd>
                  <Time value={open.detected_at} />
                </dd>
              </div>
              <div>
                <dt>{t("incident.due")}</dt>
                <dd>
                  <Time value={open.report_due_at} />
                </dd>
              </div>
              <div>
                <dt>{t("incident.categories")}</dt>
                <dd>{open.data_categories.map((c) => t(`incident.kinds.${c}`)).join(", ")}</dd>
              </div>
              {open.authority_reference ? (
                <div>
                  <dt>{t("incident.reference")}</dt>
                  <dd className="mono">{open.authority_reference}</dd>
                </div>
              ) : null}
            </dl>
            <ol className="cp-steps">
              <li className={open.status !== "open" ? "done" : ""}>
                {t("incident.steps.contain")}
              </li>
              <li className={open.authority_notified_at ? "done" : ""}>
                {t("incident.steps.notify_authority")}
              </li>
              <li className={open.subjects_notified_at ? "done" : ""}>
                {t("incident.steps.notify_subjects")}
              </li>
            </ol>
            {manage ? (
              <div className="eg-acts">
                {open.status === "open"
                  ? step("contain", t("incident.do.contain"), t("incident.done.contain"), [
                      t("incident.points.contain"),
                    ])
                  : null}
                {!open.authority_notified_at ? (
                  <FormDialog
                    action={incidentStep}
                    label={t("incident.do.notify_authority")}
                    triggerClass="btn sm pri"
                    title={t("incident.do.notify_authority")}
                    intro={t("incident.points.notify_authority")}
                    submit={t("incident.do.notify_authority")}
                    done={t("incident.done.notify_authority")}
                    fields={[
                      { kind: "hidden", name: "id", value: open.id },
                      { kind: "hidden", name: "step", value: "notify_authority" },
                      {
                        kind: "text",
                        name: "authority_reference",
                        label: t("incident.reference"),
                        mono: true,
                      },
                    ]}
                  />
                ) : null}
                {!open.subjects_notified_at
                  ? step(
                      "notify_subjects",
                      t("incident.do.notify_subjects"),
                      t("incident.done.notify_subjects"),
                      [t("incident.points.notify_subjects")],
                    )
                  : null}
                {step("close", t("incident.do.close"), t("incident.done.close"), [
                  t("incident.points.close"),
                  ...(open.authority_notified_at ? [] : [t("incident.points.notReported")]),
                ])}
              </div>
            ) : null}
          </section>
        ) : (
          <div className="card cp-empty">
            <b>{t("incident.none")}</b>
            <p className="fhint">{t("incident.noneAbout", { hours })}</p>
            {manage ? (
              <FormDialog
                action={openIncidentAction}
                label={t("incident.open.button")}
                triggerClass="btn"
                title={t("incident.open.title")}
                intro={t("incident.open.intro")}
                points={[t("incident.open.clock", { hours }), t("incident.open.notify")]}
                submit={t("incident.open.submit", { hours })}
                done={t("incident.open.done")}
                fields={[
                  {
                    kind: "checks",
                    name: "data_categories",
                    label: t("incident.categories"),
                    options: INCIDENT_CATEGORIES.map((c) => ({
                      value: c,
                      label: t(`incident.kinds.${c}`),
                    })),
                  },
                  { kind: "textarea", name: "description", label: t("incident.open.description") },
                  {
                    kind: "select",
                    name: "severity",
                    label: t("incident.open.severity"),
                    defaultValue: "medium",
                    options: ["low", "medium", "high"].map((s) => ({
                      value: s,
                      label: t(`incident.severity.${s}`),
                    })),
                  },
                  {
                    kind: "number",
                    name: "affected_count",
                    label: t("incident.open.affected"),
                    hint: t("incident.open.affectedHint"),
                  },
                ]}
              />
            ) : null}
          </div>
        )}
        {past.length > 0 ? (
          <details className="card cp-past">
            <summary>{t("incident.past", { count: past.length })}</summary>
            {past.map((incident) => (
              <div key={incident.id} className="item">
                <div className="item-main">
                  <span className="item-title mono">{incident.reference}</span>
                  <span className="item-meta">{incident.description}</span>
                  <ol className="timeline">
                    {incident.entries.map((entry) => (
                      <li key={`${entry.at}-${entry.text}`}>
                        <span>{t(`incident.entries.${entry.text}`)}</span>
                        <span className="sub">
                          <Time value={entry.at} />
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ))}
          </details>
        ) : null}
        <Basis rule={ruleAt("privacy.incident")} />
      </section>

      <section className="block" aria-labelledby="cp-dsr-h">
        <div className="block-head">
          <TipHeading id="cp-dsr-h" tip="data_requests">
            {t("requests.title")}
          </TipHeading>
          <Link className="btn sm" href="/compliance/records/requests">
            {t("requests.open")}
          </Link>
        </div>
        <p className="fhint">{t("requests.about")}</p>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("requests.waiting")}</span>
            <span className="kpi-value">{waiting.length}</span>
            <span className="kpi-sub">{t("requests.waitingSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("requests.exports")}</span>
            <span className="kpi-value">{self.exports_30d}</span>
            <span className="kpi-sub">{t("requests.selfSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("requests.deletions")}</span>
            <span className="kpi-value">{self.deletions_30d}</span>
            <span className="kpi-sub">{t("requests.keepSub")}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
