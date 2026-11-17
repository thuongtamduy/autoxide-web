import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkArchiveSubmissions,
  bulkDeleteSubmissions,
  bulkReadSubmissions,
  bulkSpamSubmissions,
  deleteForm,
  deleteSubmission,
  setFormStatus,
  setSubmissionStatus,
} from "@/app/(admin)/marketing/forms/actions";
import { ChangeButtons, ConfirmButton, type Move } from "@/components/engage/actions";
import { BackgroundExport } from "@/components/engage/background-export";
import { Back, Chips, Facts, Forbidden, PageHead } from "@/components/engage/common";
import { AutoFilter } from "@/components/ui/auto-filter";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Flash } from "@/components/ui/flash";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, isNotFound, load } from "@/lib/core";
import {
  FORMS_EXPORT,
  FORMS_MANAGE,
  FORMS_READ,
  FORMS_REVIEW,
  hrefWith,
  one,
  oneOf,
  PAGE_SIZE,
  pickText,
} from "@/lib/engage";
import {
  type Form,
  fieldLabel,
  retention,
  SUBMISSION_BADGE,
  SUBMISSION_STATUSES,
  type Submission,
  type SubmissionStatus,
  submissionMoves,
  submissionSummary,
} from "@/lib/forms";
import { readSort } from "@/lib/table";
import { can } from "@/lib/viewer";

// Một form: đóng / mở lại (có Hoàn tác), sửa, xuất CSV, xoá; hộp thư bài nộp lọc theo trạng thái
// và chữ (`q` của core, không dấu vẫn tìm ra); cấu hình đang dùng. Bài nộp: chọn nhiều để đánh dấu đã
// đọc / lưu trữ / spam / xoá (lặp lệnh từng cái của core); dòng có một nút và "⋯"; sắp theo giờ gửi
// (`order` của core). Xuất CSV theo trạng thái là của core; core chưa xuất theo danh sách bài đã chọn.
export default async function FormPage(props: PageProps<"/marketing/forms/[id]">) {
  const { id } = await props.params;
  const params = await props.searchParams;
  const status = oneOf(params, "status", SUBMISSION_STATUSES);
  const q = one(params, "q");
  const cursor = one(params, "cursor", 500);
  // Core chỉ sắp bài nộp theo giờ gửi (`order=asc|desc`): chỉ cột "Gửi lúc" sắp được.
  const sort = readSort(params, ["created"], { field: "created", dir: "desc" });
  const order = one(params, "sort") ? sort.dir : undefined;
  const t = await getTranslations("engage.forms");
  const tt = await getTranslations("table");
  const locale = await getLocale();
  let form: Form;
  let page: { data: Submission[]; pagination: { next_cursor?: string | null } };
  try {
    [{ data: form }, page] = await Promise.all([
      load((client) => client.GET("/api/v1/forms/{id}", { params: { path: { id } } })),
      load((client) =>
        client.GET("/api/v1/forms/{id}/submissions", {
          params: {
            path: { id },
            query: {
              limit: PAGE_SIZE,
              ...(status ? { status } : {}),
              ...(q ? { q } : {}),
              ...(order ? { order } : {}),
              ...(cursor ? { cursor } : {}),
            },
          },
        }),
      ),
    ]);
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={FORMS_READ} />;
    if (isNotFound(error)) notFound();
    throw error;
  }
  const [manage, exporter, review] = await Promise.all([
    can(FORMS_MANAGE),
    can(FORMS_EXPORT),
    can(FORMS_REVIEW),
  ]);
  const keep = { status, q, ...(order ? { sort: "created", dir: order } : {}) };
  const move = (to: SubmissionStatus): Move => {
    const m: Move = { value: to, label: t(`move.${to}`), done: t(`moved.${to}`) };
    if (to === "read") m.tone = "pri";
    return m;
  };
  const base = `/marketing/forms/${id}`;
  const next = page.pagination.next_cursor;
  const open = form.status === "open";
  const undo = { label: t("undo"), done: t("undone") };
  const flash = params.created
    ? t("created")
    : params.saved
      ? t("saved")
      : params.removed
        ? t("submissionDeleted")
        : null;

  return (
    <div className="page">
      {flash ? <Flash text={flash} /> : null}
      <Back href="/marketing/forms" label={t("back")} />
      <PageHead
        crumb={t("crumb")}
        title={form.name}
        badge={
          <span className={open ? "badge b-ok" : "badge b-arch"}>
            <span className="dot" />
            {t(`state.${form.status}`)}
          </span>
        }
        description={t("formAbout", { key: form.key, version: form.version })}
        actions={
          <>
            {exporter ? (
              <a className="btn" href={hrefWith(`${base}/export`, { status })} download>
                {t("export")}
              </a>
            ) : null}
            {exporter ? <BackgroundExport formId={id} status={status ?? ""} /> : null}
            {manage ? (
              <Link className="btn pri" href={`${base}/edit`}>
                {t("edit")}
              </Link>
            ) : null}
          </>
        }
      />

      {manage ? (
        <div className="eg-acts">
          <ChangeButtons
            action={setFormStatus}
            id={form.id}
            expect={form.updated_at}
            undo={undo}
            moves={[
              open
                ? { value: "closed", label: t("close"), done: t("closedDone") }
                : { value: "open", label: t("reopen"), done: t("reopened"), tone: "pri" },
            ]}
          />
          <ConfirmButton
            action={deleteForm}
            fields={{ id: form.id, expect: form.updated_at }}
            label={t("delete")}
            title={t("deleteTitle", { name: form.name })}
            points={[t("deleteSubmissions"), t("deleteExport"), t("deleteClose")]}
            submit={t("deleteSubmit")}
          />
        </div>
      ) : null}

      <section className="block" aria-labelledby="subs-h">
        <div className="block-head">
          <h2 id="subs-h" className="h2">
            {t("submissions")}
          </h2>
        </div>
        <p className="fhint">{t("submissionsAbout")}</p>
        <Chips
          label={t("filterSubmissions")}
          chips={[
            { href: hrefWith(base, { q }), label: t("inbox"), on: !status },
            // Số trên chip: số bài theo trạng thái của cả form (`submissions` của core).
            ...SUBMISSION_STATUSES.map((s) => ({
              href: hrefWith(base, { status: s, q }),
              label: t(`sub.${s}`),
              on: status === s,
              ...(form.submissions ? { count: form.submissions[s] } : {}),
            })),
          ]}
        />
        <form method="get" action={base} className="filters">
          <AutoFilter />
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label className="fld grow">
            <span className="lab">{t("search")}</span>
            <input
              className="inp"
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("searchHint")}
              maxLength={200}
            />
          </label>
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("apply")}
            </button>
            {q ? (
              <Link className="btn ghost" href={hrefWith(base, { status })}>
                {t("clear")}
              </Link>
            ) : null}
          </div>
        </form>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{q || status ? t("noMatch") : t("noSubmissions")}</p>
          ) : (
            <BulkTable
              ids={page.data.map((submission) => submission.id)}
              actions={
                review
                  ? [
                      { key: "read", label: t("move.read"), run: bulkReadSubmissions },
                      { key: "archived", label: t("move.archived"), run: bulkArchiveSubmissions },
                      { key: "spam", label: t("move.spam"), run: bulkSpamSubmissions },
                      {
                        key: "delete",
                        label: t("deleteSubmission"),
                        tone: "danger",
                        run: bulkDeleteSubmissions,
                        confirm: {
                          title: t("bulkDeleteSubmissionsTitle"),
                          points: [t("deleteSubmissionGone"), t("deleteSubmissionExport")],
                          submit: t("deleteSubmit"),
                        },
                      },
                    ]
                  : []
              }
            >
              <Table cards>
                <thead>
                  <tr>
                    {review ? <SelectAllTh /> : null}
                    <Th>{t("col.sender")}</Th>
                    <Th>{t("col.content")}</Th>
                    <SortTh field="created" sort={sort} base={base} keep={keep} first="desc">
                      {t("col.sent")}
                    </SortTh>
                    <Th>{t("col.status")}</Th>
                    <Th>
                      <span className="vh">{t("col.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((submission) => {
                    const summary = submissionSummary(submission);
                    const moves = review ? submissionMoves(submission.status).map(move) : [];
                    return (
                      <tr key={submission.id}>
                        {review ? <SelectTd id={submission.id} name={summary.who} /> : null}
                        <Td className="rt-title">
                          <span className="cell2">
                            <Link
                              className="open ell"
                              href={`${base}/submissions/${submission.id}`}
                            >
                              {summary.who}
                            </Link>
                            {summary.sub ? (
                              <span className="sub mono ell">{summary.sub}</span>
                            ) : null}
                          </span>
                        </Td>
                        <Td label={t("col.content")}>
                          <span className="eg-clamp">{summary.text || "—"}</span>
                        </Td>
                        <Td className="whitespace-nowrap" label={t("col.sent")}>
                          <Time value={submission.created_at} />
                        </Td>
                        <Td label={t("col.status")}>
                          <span className={SUBMISSION_BADGE[submission.status]}>
                            <span className="dot" />
                            {t(`sub.${submission.status}`)}
                          </span>
                        </Td>
                        <Td label={t("col.actions")}>
                          {/* Một nút trên dòng (nước đi đầu, vd "Đã đọc"), còn lại trong "⋯". */}
                          <span className="row-acts">
                            {moves.length > 0 ? (
                              <ChangeButtons
                                action={setSubmissionStatus}
                                id={submission.id}
                                expect={submission.updated_at}
                                undo={undo}
                                moves={moves.slice(0, 1)}
                              />
                            ) : null}
                            <RowMenu
                              label={tt("moreFor", { name: summary.who })}
                              items={[
                                {
                                  label: t("open"),
                                  href: `${base}/submissions/${submission.id}`,
                                },
                                ...moves.slice(1).map((m) => ({
                                  label: m.label,
                                  change: {
                                    action: setSubmissionStatus,
                                    id: submission.id,
                                    expect: submission.updated_at,
                                    value: m.value,
                                    done: m.done,
                                    undo,
                                  },
                                })),
                                ...(review
                                  ? [
                                      {
                                        label: t("deleteSubmission"),
                                        danger: true,
                                        dialog: (
                                          <ConfirmButton
                                            action={deleteSubmission}
                                            fields={{ id: submission.id, form: id }}
                                            label={t("deleteSubmission")}
                                            title={t("deleteSubmissionTitle")}
                                            points={[
                                              t("deleteSubmissionGone"),
                                              t("deleteSubmissionExport"),
                                            ]}
                                            submit={t("deleteSubmit")}
                                          />
                                        ),
                                      },
                                    ]
                                  : []),
                              ]}
                            />
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        {/* Core phân trang theo con trỏ, không trả tổng. */}
        <Pager
          first={cursor ? hrefWith(base, keep) : null}
          next={next ? hrefWith(base, { ...keep, cursor: next }) : null}
        />
        {exporter ? <p className="note">{t("exportNote")}</p> : null}
      </section>

      <section className="block" aria-labelledby="cfg-h">
        <h2 id="cfg-h" className="h2">
          {t("config")}
        </h2>
        <div className="card padded">
          <Facts
            items={[
              [
                t("fieldsLabel"),
                form.fields
                  .map((f) => `${fieldLabel(f, locale)}${f.required ? " *" : ""}`)
                  .join(", "),
              ],
              [t("notifyLabel"), form.notify_emails.join(", ") || t("none")],
              [t("replyToLabel"), form.reply_to_field ?? t("none")],
              [t("originsLabel"), form.allowed_origins.join(", ") || t("anyOrigin")],
              [
                t("limitsLabel"),
                t("limits", {
                  ip: form.ip_limit_per_hour ?? t("serverDefault"),
                  email: form.email_limit_per_hour ?? t("serverDefault"),
                }),
              ],
              [t("retentionLabel"), retention(form.retention_days, t)],
              [t("successLabel"), pickText(form.success_message, locale) || t("none")],
              [t("updatedLabel"), <Time key="u" value={form.updated_at} />],
            ]}
          />
        </div>
        <p className="note">{t("embed", { key: form.key, scope: form.token_scope })}</p>
      </section>
    </div>
  );
}
