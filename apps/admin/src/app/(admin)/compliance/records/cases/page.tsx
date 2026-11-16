import { getTranslations } from "next-intl/server";
import {
  decideCaseAction,
  notifyCaseRespondent,
  restrictTarget,
} from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis } from "@/components/compliance/common";
import { ChangeButtons, ConfirmButton } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import { FormDialog } from "@/components/ui/form-dialog";
import { Time } from "@/components/ui/time";
import { CASES_HANDLE, CASES_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { CASE_STATUSES, type CaseStatus, listCases } from "@/sample/compliance-records";
import { ruleAt } from "@/sample/compliance-rules";

const CASE_BADGE = {
  received: "badge b-warn",
  under_review: "badge b-info",
  awaiting_response: "badge b-violet",
  decided: "badge b-ok",
  closed: "badge b-arch",
  withdrawn: "badge b-arch",
} as const;

// Tab "Vụ việc": báo vi phạm sở hữu trí tuệ, hàng giả, hàng cấm, khiếu nại người tiêu dùng. Luồng:
// nhận → ẩn tạm (đảo được) → báo bên bị phản ánh → quyết định (không đảo được, cần phiên người).
// Hạn tính theo ngày làm việc từ `cases.deadlines`; mọi bước thêm một dòng lưu vết.
export default async function CasesTab(props: PageProps<"/compliance/records/cases">) {
  const gate = await sampleGate(CASES_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.records.cases");
  const { status } = await props.searchParams;
  const current = CASE_STATUSES.find((s) => s === status);
  const [{ data: all }, handle] = await Promise.all([listCases(), can(CASES_HANDLE)]);
  const cases = current ? all.filter((c) => c.status === current) : all;
  const entry = (text: string) => (t.has(`entries.${text}`) ? t(`entries.${text}`) : text);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="cp-cases-h">
        <h2 id="cp-cases-h" className="h2">
          {t("title")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <Chips
          label={t("filter")}
          chips={[
            { href: "/compliance/records/cases", label: t("all"), on: !current, count: all.length },
            ...CASE_STATUSES.map((s: CaseStatus) => ({
              href: `/compliance/records/cases?status=${s}`,
              label: t(`status.${s}`),
              on: current === s,
              count: all.filter((c) => c.status === s).length,
            })),
          ]}
        />
        {cases.length === 0 ? <p className="card empty">{t("empty")}</p> : null}
        {cases.map((c) => {
          const open = ["received", "under_review", "awaiting_response"].includes(c.status);
          return (
            <article key={c.id} className="card cp-case" aria-labelledby={`case-${c.id}`}>
              <div className="block-head">
                <h3 id={`case-${c.id}`} className="h2 mono">
                  {c.reference}
                </h3>
                <span className={CASE_BADGE[c.status]}>
                  <span className="dot" />
                  {t(`status.${c.status}`)}
                </span>
                {c.restricted ? <span className="badge b-arch">{t("hidden")}</span> : null}
              </div>
              <p>
                <b>{t(`kinds.${c.kind}`)}</b> · {c.target.title}
              </p>
              <p className="fhint">{c.claim}</p>
              <dl className="eg-facts">
                <div>
                  <dt>{t("reporter")}</dt>
                  <dd>{t(`reporters.${c.reporter_kind}`)}</dd>
                </div>
                <div>
                  <dt>{t("respondent")}</dt>
                  <dd>{c.respondent?.name ?? "—"}</dd>
                </div>
                {c.respond_by && c.status === "awaiting_response" ? (
                  <div>
                    <dt>{t("respondBy")}</dt>
                    <dd>
                      <Time value={c.respond_by} />
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>{c.decided_at ? t("decidedAt") : t("decideBy")}</dt>
                  <dd>
                    <Time value={c.decided_at ?? c.decide_by} />
                  </dd>
                </div>
                {c.decision ? (
                  <div>
                    <dt>{t("decision")}</dt>
                    <dd>{t(`decisions.${c.decision}`)}</dd>
                  </div>
                ) : null}
              </dl>
              <details className="cp-trail">
                <summary>{t("trail", { count: c.entries.length })}</summary>
                <ol className="timeline">
                  {c.entries.map((e) => (
                    <li key={`${e.at}-${e.kind}-${e.text}`}>
                      <span>{entry(e.text)}</span>
                      <span className="sub">
                        <Time value={e.at} />
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
              {handle && open ? (
                <div className="eg-acts">
                  {c.restricted || c.kind === "consumer_complaint" ? null : (
                    <ChangeButtons
                      action={restrictTarget}
                      id={c.id}
                      expect="-"
                      undo={{ label: t("undo"), done: t("restored") }}
                      moves={[
                        { value: "restrict", label: t("restrict"), done: t("restrictedDone") },
                      ]}
                    />
                  )}
                  {c.respondent && c.status !== "awaiting_response" ? (
                    <ConfirmButton
                      action={notifyCaseRespondent}
                      fields={{ id: c.id }}
                      label={t("notify.button")}
                      title={t("notify.title", { name: c.respondent.name })}
                      points={[t("notify.mail"), t("notify.deadline")]}
                      submit={t("notify.submit")}
                      done={t("notify.done")}
                      danger={false}
                    />
                  ) : null}
                  {open ? (
                    <FormDialog
                      action={decideCaseAction}
                      label={t("decide.button")}
                      triggerClass="btn sm pri"
                      title={t("decide.title", { reference: c.reference })}
                      points={[t("decide.final"), t("decide.human"), t("decide.parties")]}
                      submit={t("decide.submit")}
                      done={t("decide.done")}
                      fields={[
                        { kind: "hidden", name: "id", value: c.id },
                        {
                          kind: "select",
                          name: "decision",
                          label: t("decision"),
                          options: ["upheld", "partially_upheld", "rejected"].map((d) => ({
                            value: d,
                            label: t(`decisions.${d}`),
                          })),
                        },
                        { kind: "textarea", name: "reason", label: t("decide.reason") },
                      ]}
                    />
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
        <p className="fhint">{t("human")}</p>
        <Basis rule={ruleAt("cases.deadlines")} lead={t("deadlines")} />
      </section>
    </div>
  );
}
