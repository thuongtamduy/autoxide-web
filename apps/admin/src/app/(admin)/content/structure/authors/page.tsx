import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { AuthorDialog } from "@/components/structure/forms";
import { AutoFilter } from "@/components/ui/auto-filter";
import { ConfirmAction } from "@/components/ui/confirm";
import type { Author } from "@/lib/content";
import { isForbidden, load } from "@/lib/core";
import { isUuid, mediaIdSrc } from "@/lib/media";
import { CONTENT_MANAGE, CONTENT_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { deleteAuthor } from "../actions";

// Tab "Tác giả": hồ sơ công khai của module nội dung, tách khỏi tài khoản đăng nhập, kèm số bài
// (`entry_count`; bấm để xem các bài đó). Ô tìm gửi `q` cho core. Một bài có thể có nhiều tác giả
// (đặt trong trình soạn). Thêm, sửa, xoá cần `content.manage`.
export default async function AuthorsTab(props: PageProps<"/content/structure/authors">) {
  const t = await getTranslations("structure.authors");
  const raw = (await props.searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 200) ?? "";
  let authors: Author[];
  let more = false;
  try {
    const page = await load((c) =>
      c.GET("/api/v1/content/authors", {
        params: { query: { limit: 200, order: "asc", ...(q ? { q } : {}) } },
      }),
    );
    authors = page.data;
    more = Boolean(page.pagination.next_cursor);
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
        <form method="get" action="/content/structure/authors" className="filters">
          <AutoFilter />
          <label className="fld grow">
            <span className="lab">{t("search")}</span>
            <input
              className="inp"
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t("searchHint")}
              maxLength={200}
            />
          </label>
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("find")}
            </button>
            {q ? (
              <Link className="btn ghost" href="/content/structure/authors">
                {t("clear")}
              </Link>
            ) : null}
          </div>
        </form>
        {authors.length === 0 ? (
          <div className="card">
            <p className="empty">{q ? t("noMatch") : t("empty")}</p>
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
                {author.entry_count !== undefined && author.entry_count !== null ? (
                  author.entry_count > 0 ? (
                    <Link className="fhint" href={`/content?author=${author.id}`}>
                      {t("posts", { count: author.entry_count })}
                    </Link>
                  ) : (
                    <span className="fhint">{t("posts", { count: 0 })}</span>
                  )
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
        {more ? <p className="fhint">{t("more")}</p> : null}
      </section>
    </div>
  );
}
