import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { loadOptional } from "@/lib/core";
import { formatDate, initials, pick } from "@/lib/format";
import type { PublicComment } from "@/lib/types";
import { CommentForm, type CommentFormSettings } from "./comment-form";
import { ReplyBox } from "./reply-box";

// Bình luận dưới bài viết (module `comments` thật). Theo cài đặt công khai của core: tắt thì không
// có khối này; loại đích chỉ cho người đã đăng nhập / đã xác thực thì báo (website chưa có đăng nhập
// cho người mua); khách được bình luận thì có ô viết. Thân bình luận hiện bằng `body_html` của core
// (core đã thoát mọi HTML, kể cả với Markdown) — không bao giờ chèn `body` như HTML.

const TARGET = "content.entry";
const AVATAR_TONES = ["#5B3FA6", "#1F6B4F", "#B4380F", "#2E4C7C", "#7C5133"];

function CommentItem({
  comment,
  locale,
  t,
}: {
  comment: PublicComment;
  locale: string;
  t: (key: string) => string;
}) {
  const name = comment.author.name ?? t("guest");
  return (
    <div className="cm-item">
      <span
        className="cm-avatar"
        aria-hidden="true"
        style={{ background: AVATAR_TONES[pick(name, AVATAR_TONES.length)] }}
      >
        {comment.deleted ? "–" : initials(name)}
      </span>
      <span className="cm-main">
        <span className="cm-head">
          <b>{comment.deleted ? t("deletedName") : name}</b>
          <time className="muted" dateTime={comment.created_at}>
            {formatDate(comment.created_at, locale)}
          </time>
          {comment.edited_at ? <span className="muted">· {t("edited")}</span> : null}
          {comment.badges.map((badge) =>
            badge === "seller" || badge === "verified_buyer" ? (
              <span
                key={badge}
                className={`badge ${badge === "seller" ? "b-brand" : "b-ok"} cm-badge`}
              >
                {t(`badge_${badge}`)}
              </span>
            ) : null,
          )}
        </span>
        {comment.deleted ? (
          <span className="muted cm-text">{t("deleted")}</span>
        ) : (
          <span
            className="cm-text"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: `body_html` là HTML an toàn do core dựng (đã thoát mọi thẻ, chỉ giữ thẻ định dạng cho phép); OpenAPI yêu cầu chèn trường này, không chèn `body`
            dangerouslySetInnerHTML={{ __html: comment.body_html }}
          />
        )}
      </span>
    </div>
  );
}

export async function CommentsSection({
  locale,
  targetId,
  cursor,
  basePath,
}: {
  locale: Locale;
  targetId: string;
  /** Con trỏ của trang bình luận (tham số `cm` của địa chỉ). */
  cursor?: string | undefined;
  /** Đường dẫn của bài (không tiền tố ngôn ngữ), để dựng link "Xem thêm bình luận". */
  basePath: string;
}) {
  const settings = (
    await loadOptional(locale, (client) => client.GET("/api/v1/comments/public/settings"))
  )?.data;
  if (!settings?.enabled || !settings.target_types.includes(TARGET)) return null;
  const t = await getTranslations({ locale, namespace: "comments" });
  const [target, threads] = await Promise.all([
    loadOptional(locale, (client) =>
      client.GET("/api/v1/comments/public/targets/{target_type}/{target_id}", {
        params: { path: { target_type: TARGET, target_id: targetId } },
      }),
    ),
    loadOptional(locale, (client) =>
      client.GET("/api/v1/comments/public/threads", {
        params: {
          query: {
            target_type: TARGET,
            target_id: targetId,
            replies_limit: 3,
            limit: 20,
            order: "asc",
            ...(cursor ? { cursor } : {}),
          },
        },
      }),
    ),
  ]);
  const state = target?.data;
  if (state?.hidden) return null;
  const open = state ? state.state === "open" : true;
  const needsAccount =
    settings.signed_in_only_types.includes(TARGET) ||
    settings.verified_only_types.includes(TARGET) ||
    !settings.guests_allowed;
  const form: CommentFormSettings = {
    targetType: TARGET,
    targetId,
    tokenScope: settings.token_scope.replace("{target_type}", TARGET),
    maxLength: settings.max_length,
    markdown: settings.markdown,
    replyMails: settings.reply_mails,
  };
  const canWrite = open && !needsAccount;
  const tr = (key: string) => t(key as Parameters<typeof t>[0]);
  const list = threads?.data ?? [];
  const next = threads?.pagination.next_cursor ?? null;
  return (
    <section id="comments" className="cm" aria-labelledby="comments-h">
      <h2 id="comments-h" className="dsp cm-title">
        {t("title", { count: state?.comment_count ?? list.length })}
      </h2>
      {!open ? <p className="muted">{t("closed")}</p> : null}
      {open && needsAccount ? <p className="muted">{t("signIn")}</p> : null}
      {canWrite ? <CommentForm locale={locale} settings={form} /> : null}
      {list.length === 0 && open ? <p className="muted cm-empty">{t("empty")}</p> : null}
      <ol className="cm-list">
        {list.map((thread) => (
          <li key={thread.id} className="cm-thread">
            <CommentItem comment={thread} locale={locale} t={tr} />
            {thread.replies.length > 0 ? (
              <ol className="cm-replies">
                {thread.replies.map((reply) => (
                  <li key={reply.id}>
                    <CommentItem comment={reply} locale={locale} t={tr} />
                  </li>
                ))}
              </ol>
            ) : null}
            {thread.reply_count > thread.replies.length ? (
              <p className="muted cm-more-replies">
                {t("moreReplies", { count: thread.reply_count - thread.replies.length })}
              </p>
            ) : null}
            {canWrite && !thread.deleted ? (
              <ReplyBox
                locale={locale}
                settings={form}
                parentId={thread.id}
                name={thread.author.name ?? t("guest")}
              />
            ) : null}
          </li>
        ))}
      </ol>
      {next ? (
        <Link className="btn" href={`${basePath}?cm=${encodeURIComponent(next)}#comments`}>
          {t("more")}
        </Link>
      ) : null}
    </section>
  );
}
