import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { AuthorDialog } from "@/components/structure/forms";
import { ConfirmAction } from "@/components/ui/confirm";
import type { Author } from "@/lib/content";
import { isForbidden, load } from "@/lib/core";
import { isUuid, mediaIdSrc } from "@/lib/media";
import { CONTENT_MANAGE, CONTENT_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { deleteAuthor } from "../actions";

// Tab "Tác giả": hồ sơ công khai của module nội dung, tách khỏi tài khoản đăng nhập. Một bài có thể
// có nhiều tác giả (đặt trong trình soạn). Thêm, sửa, xoá cần `content.manage`.
export default async function AuthorsTab() {
  const t = await getTranslations("structure.authors");
  let authors: Author[];
  try {
    authors = (
      await load((c) =>
        c.GET("/api/v1/content/authors", { params: { query: { limit: 200, order: "asc" } } }),
      )
    ).data;
  } catch (error) {
    if (isForbidden(error)) {
      const errors = await getTranslations("errors");
      return (
        <MessagePanel
          title={errors("forbiddenTitle")}
          message={errors("forbidden", { permission: CONTENT_READ })}
        />
      );
    }
    throw error;
  }
  const manage = await can(CONTENT_MANAGE);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="st-auth-h">
        <div className="block-head">
          <h2 id="st-auth-h" className="h2">
            {t("title")}
          </h2>
          {manage ? <AuthorDialog /> : null}
        </div>
        <p className="fhint">{t("about")}</p>
        {authors.length === 0 ? (
          <div className="card">
            <p className="empty">{t("empty")}</p>
          </div>
        ) : (
          <ul className="st-tiles">
            {authors.map((author) => (
              <li key={author.id} className="card st-tile">
                <span className="st-tile-head">
                  {author.avatar_media_id && isUuid(author.avatar_media_id) ? (
                    // biome-ignore lint/performance/noImgElement: ảnh đi qua route `/media/…` của giao diện
                    <img className="st-avatar" src={mediaIdSrc(author.avatar_media_id)} alt="" />
                  ) : (
                    <span className="avatar st-avatar" aria-hidden="true">
                      {author.display_name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="cell2">
                    <b>{author.display_name}</b>
                    <span className="sub mono">/{author.slug}</span>
                  </span>
                  <span className={author.user_id ? "badge b-info" : "badge b-draft"}>
                    {t(author.user_id ? "linked" : "notLinked")}
                  </span>
                </span>
                {author.bio ? <p className="st-bio">{author.bio}</p> : null}
                {author.website_url ? (
                  <span className="fhint mono ell">{author.website_url}</span>
                ) : null}
                {manage ? (
                  <span className="row-acts st-tile-acts">
                    <AuthorDialog author={author} />
                    <ConfirmAction
                      action={deleteAuthor}
                      id={author.id}
                      label={t("delete")}
                      title={t("deleteTitle", { name: author.display_name })}
                      points={[t("deletePosts"), t("deletePage")]}
                      submit={t("delete")}
                      done={t("deleted")}
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="fhint">{t("countMissing")}</p>
      </section>
    </div>
  );
}
