import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { moderateComment, purgeComment } from "@/app/(admin)/marketing/comments/actions";
import { ChangeButtons, ConfirmButton, type Move } from "@/components/engage/actions";
import { BanDialog } from "@/components/engage/comment-forms";
import { Back, Facts, Forbidden, PageHead } from "@/components/engage/common";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import {
  banChoices,
  COMMENT_BADGE,
  type CommentDetail,
  holdReasons,
  isKnownReason,
  moderationMoves,
  targetHref,
} from "@/lib/comments";
import { targetKey, targetLabels } from "@/lib/comments-server";
import { isForbidden, isNotFound, load } from "@/lib/core";
import { COMMENTS_MANAGE, COMMENTS_MODERATE, COMMENTS_READ, hrefWith } from "@/lib/engage";
import { can } from "@/lib/viewer";

type Report = { id: string; reason: string; note?: string | null; created_at: string };

// Một bình luận với mọi thứ người kiểm duyệt cần: chữ gốc, tác giả (email, dấu vết mạng đã băm),
// đích, vị trí trong luồng, lý do giữ lại, báo cáo vi phạm. Duyệt / từ chối / spam / giữ lại (có
// Hoàn tác), xoá hẳn theo yêu cầu gỡ, cấm tác giả. Chữ hiện như chữ thường, không chèn HTML.
export default async function CommentPage(props: PageProps<"/marketing/comments/[id]">) {
  const { id } = await props.params;
  const t = await getTranslations("engage.comments");
  let comment: CommentDetail;
  let reports: Report[];
  try {
    [{ data: comment }, { data: reports }] = await Promise.all([
      load((client) => client.GET("/api/v1/comments/{id}", { params: { path: { id } } })),
      load((client) =>
        client.GET("/api/v1/comments/{id}/reports", {
          params: { path: { id }, query: { limit: 50 } },
        }),
      ),
    ]);
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={COMMENTS_READ} />;
    if (isNotFound(error)) notFound();
    throw error;
  }
  const [moderate, manage] = await Promise.all([can(COMMENTS_MODERATE), can(COMMENTS_MANAGE)]);
  const labels = await targetLabels([{ type: comment.target_type, id: comment.target_id }]);
  const label = labels.get(targetKey(comment.target_type, comment.target_id));
  const reasons = holdReasons(comment.hold_reason);
  const moves = moderationMoves(comment.status).map((to) => {
    const move: Move = { value: to, label: t(`move.${to}`), done: t(`moved.${to}`) };
    if (to === "published") move.tone = "pri";
    return move;
  });
  const base = "/marketing/comments";
  const author = comment.author_name ?? t("noName");

  return (
    <div className="page">
      <Back href={base} label={t("back")} />
      <PageHead
        crumb={t("crumb")}
        title={t("commentBy", { name: author })}
        badge={
          <span className={COMMENT_BADGE[comment.status]}>
            <span className="dot" />
            {t(`status.${comment.status}`)}
          </span>
        }
        description={t(`statusAbout.${comment.status}`)}
      />
      <div className="eg-acts">
        {moderate && moves.length > 0 ? (
          <ChangeButtons
            action={moderateComment}
            id={comment.id}
            expect={comment.updated_at}
            undo={{ label: t("undo"), done: t("undone") }}
            moves={moves}
            small={false}
          />
        ) : null}
        {manage && comment.status !== "deleted" ? (
          <BanDialog choices={banChoices(comment)} label={t("banAuthor")} small={false} />
        ) : null}
        {moderate ? (
          <ConfirmButton
            action={purgeComment}
            fields={{ id: comment.id }}
            label={t("purge")}
            title={t("purgeTitle")}
            points={[
              comment.parent_id
                ? t("purgeReply")
                : t("purgeThread", { count: comment.reply_count }),
              t("purgeAudit"),
              t("purgeNoUndo"),
            ]}
            submit={t("purgeSubmit")}
            small={false}
          />
        ) : null}
      </div>

      <div className="blocks">
        <section className="block" aria-labelledby="body-h">
          <h2 id="body-h" className="h2">
            {t("text")}
          </h2>
          <div className="card padded">
            {comment.body ? (
              <p className="eg-pre">{comment.body}</p>
            ) : (
              <p className="empty">{t("noText")}</p>
            )}
          </div>
          {reasons.length > 0 ? (
            <p className="fhint">
              {t("heldFor", {
                reasons: reasons.map((r) => (isKnownReason(r) ? t(`hold.${r}`) : r)).join(", "),
              })}
            </p>
          ) : null}
        </section>

        <section className="block" aria-labelledby="who-h">
          <h2 id="who-h" className="h2">
            {t("author")}
          </h2>
          <div className="card padded">
            <Facts
              items={[
                [t("nameLabel"), author],
                [t("kindLabel"), t(`kind.${comment.author_kind}`)],
                [
                  t("emailLabel"),
                  comment.author_email
                    ? `${comment.author_email} · ${
                        comment.email_verified ? t("verified") : t("unverified")
                      }`
                    : "—",
                ],
                [
                  t("userLabel"),
                  <span key="u" className="mono">
                    {comment.user_id ?? "—"}
                  </span>,
                ],
                [
                  t("ipLabel"),
                  <span key="ip" className="mono">
                    {comment.ip_fingerprint ?? t("ipCleared")}
                  </span>,
                ],
                [t("localeLabel"), comment.locale ?? "—"],
              ]}
            />
          </div>
        </section>

        <section className="block" aria-labelledby="where-h">
          <h2 id="where-h" className="h2">
            {t("where")}
          </h2>
          <div className="card padded">
            <Facts
              items={[
                [
                  t("col.target"),
                  <Link key="t" href={targetHref(comment.target_type, comment.target_id)}>
                    {label?.title ?? comment.target_id}
                  </Link>,
                ],
                [
                  t("typeLabel"),
                  <span key="ty" className="mono">
                    {comment.target_type}
                  </span>,
                ],
                [
                  t("threadLabel"),
                  comment.parent_id ? (
                    <Link key="p" href={`${base}/${comment.root_id}`}>
                      {t("replyOf")}
                    </Link>
                  ) : (
                    t("topLevel", { count: comment.reply_count })
                  ),
                ],
                [t("createdLabel"), <Time key="c" value={comment.created_at} />],
                [
                  t("publishedLabel"),
                  comment.published_at ? <Time key="p2" value={comment.published_at} /> : "—",
                ],
                [
                  t("editedLabel"),
                  comment.edited_at ? <Time key="e" value={comment.edited_at} /> : "—",
                ],
              ]}
            />
          </div>
          {label?.href ? (
            <p className="fhint">
              <Link href={label.href}>{t("openTarget")}</Link> ·{" "}
              <Link
                href={hrefWith(base, {
                  type: comment.target_type,
                  target: comment.target_id,
                  status: "published",
                })}
              >
                {t("targetComments")}
              </Link>
            </p>
          ) : null}
        </section>

        <section className="block" aria-labelledby="rep-h">
          <h2 id="rep-h" className="h2">
            {t("reportsTitle", { count: comment.report_count })}
          </h2>
          <div className="card tcard">
            {reports.length === 0 ? (
              <p className="empty">{t("noReports")}</p>
            ) : (
              <Table cards>
                <thead>
                  <tr>
                    <Th>{t("col.reportReason")}</Th>
                    <Th>{t("col.note")}</Th>
                    <Th>{t("col.when")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id}>
                      <Td className="rt-title">
                        {t.has(`reportReason.${r.reason}`)
                          ? t(`reportReason.${r.reason}`)
                          : r.reason}
                      </Td>
                      <Td label={t("col.note")}>{r.note || "—"}</Td>
                      <Td className="whitespace-nowrap" label={t("col.when")}>
                        <Time value={r.created_at} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
