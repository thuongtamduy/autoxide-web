import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { deleteForm, setFormStatus } from "@/app/(admin)/marketing/forms/actions";
import { ChangeButtons, ConfirmButton } from "@/components/engage/actions";
import { Back, Chips, Facts, Forbidden, PageHead, Pager } from "@/components/engage/common";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, isNotFound, load } from "@/lib/core";
import {
  FORMS_EXPORT,
  FORMS_MANAGE,
  FORMS_READ,
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
  submissionSummary,
} from "@/lib/forms";
import { can } from "@/lib/viewer";

// Một form: đóng / mở lại (có Hoàn tác), sửa, xuất CSV, xoá; hộp thư bài nộp lọc theo trạng thái
// và chữ (`q` của core, không dấu vẫn tìm ra); cấu hình đang dùng.
export default async function FormPage(props: PageProps<"/marketing/forms/[id]">) {
  const { id } = await props.params;
  const params = await props.searchParams;
  const status = oneOf(params, "status", SUBMISSION_STATUSES);
  const q = one(params, "q");
  const cursor = one(params, "cursor", 500);
  const t = await getTranslations("engage.forms");
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
  const [manage, exporter] = await Promise.all([can(FORMS_MANAGE), can(FORMS_EXPORT)]);
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
            ...SUBMISSION_STATUSES.map((s) => ({
              href: hrefWith(base, { status: s, q }),
              label: t(`sub.${s}`),
              on: status === s,
            })),
          ]}
        />
        <form method="get" action={base} className="filters">
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
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("col.sender")}</Th>
                  <Th>{t("col.content")}</Th>
                  <Th>{t("col.sent")}</Th>
                  <Th>{t("col.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((submission) => {
                  const summary = submissionSummary(submission);
                  return (
                    <tr key={submission.id}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link className="open ell" href={`${base}/submissions/${submission.id}`}>
                            {summary.who}
                          </Link>
                          {summary.sub ? <span className="sub mono ell">{summary.sub}</span> : null}
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
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
        <Pager
          first={cursor ? hrefWith(base, { status, q }) : null}
          next={next ? hrefWith(base, { status, q, cursor: next }) : null}
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
