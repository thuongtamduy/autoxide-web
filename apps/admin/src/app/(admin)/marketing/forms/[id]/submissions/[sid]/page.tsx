import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { deleteSubmission, setSubmissionStatus } from "@/app/(admin)/marketing/forms/actions";
import { ChangeButtons, ConfirmButton } from "@/components/engage/actions";
import { Back, Facts, Forbidden, PageHead } from "@/components/engage/common";
import { Time } from "@/components/ui/time";
import { isForbidden, isNotFound, load } from "@/lib/core";
import { FORMS_READ, FORMS_REVIEW, pickText } from "@/lib/engage";
import {
  answerText,
  type Form,
  SUBMISSION_BADGE,
  type Submission,
  submissionMoves,
  submissionSummary,
} from "@/lib/forms";
import { can } from "@/lib/viewer";

// Một bài nộp: câu trả lời với nhãn của đúng phiên bản form lúc gửi, bằng chứng đồng ý, nơi gửi;
// đổi trạng thái (có Hoàn tác) và xoá hẳn. Bài nộp chứa dữ liệu cá nhân: chỉ ai có `forms.read`.
export default async function SubmissionPage(
  props: PageProps<"/marketing/forms/[id]/submissions/[sid]">,
) {
  const { id, sid } = await props.params;
  const t = await getTranslations("engage.forms");
  const locale = await getLocale();
  let submission: Submission;
  let form: Form;
  try {
    [{ data: submission }, { data: form }] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/forms/submissions/{id}", { params: { path: { id: sid } } }),
      ),
      load((client) => client.GET("/api/v1/forms/{id}", { params: { path: { id } } })),
    ]);
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={FORMS_READ} />;
    if (isNotFound(error)) notFound();
    throw error;
  }
  if (submission.form_id !== id) notFound();
  const review = await can(FORMS_REVIEW);
  const summary = submissionSummary(submission);
  const consent = submission.consent as
    | { text?: string; version?: number | string; at?: string; source?: string }
    | null
    | undefined;
  const yesNo = { yes: t("yes"), no: t("no") };
  const tone = (s: string) =>
    s === "read" ? ("pri" as const) : s === "spam" ? ("danger" as const) : undefined;

  return (
    <div className="page">
      <Back href={`/marketing/forms/${id}`} label={t("backToForm")} />
      <PageHead
        crumb={t("submissionCrumb", { key: submission.form_key, version: submission.form_version })}
        title={summary.who}
        badge={
          <span className={SUBMISSION_BADGE[submission.status]}>
            <span className="dot" />
            {t(`sub.${submission.status}`)}
          </span>
        }
      />
      <p className="fhint">
        {t("sentAt")} <Time value={submission.created_at} />
        {submission.spam_reason ? ` · ${t("spamReason", { reason: submission.spam_reason })}` : ""}
      </p>
      {review ? (
        <div className="eg-acts">
          <ChangeButtons
            action={setSubmissionStatus}
            id={submission.id}
            expect={submission.updated_at}
            undo={{ label: t("undo"), done: t("undone") }}
            moves={submissionMoves(submission.status).map((s) => {
              const move = { value: s, label: t(`move.${s}`), done: t(`moved.${s}`) };
              const kind = tone(s);
              return kind ? { ...move, tone: kind } : move;
            })}
          />
          <ConfirmButton
            action={deleteSubmission}
            fields={{ id: submission.id, form: id }}
            label={t("deleteSubmission")}
            title={t("deleteSubmissionTitle")}
            points={[t("deleteSubmissionGone"), t("deleteSubmissionExport")]}
            submit={t("deleteSubmit")}
          />
        </div>
      ) : null}

      <div className="blocks">
        <section className="block" aria-labelledby="ans-h">
          <h2 id="ans-h" className="h2">
            {t("answers")}
          </h2>
          <div className="card padded">
            <Facts
              items={submission.answers.map((answer) => [
                pickText(answer.label, locale) || answer.key,
                <span key={answer.key} className="eg-pre">
                  {answerText(
                    answer,
                    yesNo,
                    form.fields.find((f) => f.key === answer.key),
                    locale,
                  )}
                </span>,
              ])}
            />
          </div>
        </section>

        {consent ? (
          <section className="block" aria-labelledby="consent-h">
            <h2 id="consent-h" className="h2">
              {t("consent")}
            </h2>
            <div className="card padded">
              <Facts
                items={[
                  [t("consentText"), consent.text ?? "—"],
                  [t("consentVersion"), String(consent.version ?? "—")],
                  [t("consentAt"), consent.at ? <Time key="at" value={consent.at} /> : "—"],
                ]}
              />
            </div>
          </section>
        ) : null}

        <section className="block" aria-labelledby="meta-h">
          <h2 id="meta-h" className="h2">
            {t("origin")}
          </h2>
          <div className="card padded">
            <Facts
              items={[
                [t("emailLabel"), submission.email ?? "—"],
                [t("page"), submission.page_url ?? "—"],
                [t("referrer"), submission.referrer ?? "—"],
                [t("language"), submission.locale ?? "—"],
                [
                  t("ip"),
                  <span key="ip" className="mono">
                    {submission.ip_fingerprint ?? t("ipCleared")}
                  </span>,
                ],
                [t("agent"), submission.user_agent ?? "—"],
              ]}
            />
          </div>
          <p className="note">{t("personalNote")}</p>
        </section>
      </div>
    </div>
  );
}
