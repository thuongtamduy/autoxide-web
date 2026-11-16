import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { FolderBar, NewFolderDialog } from "@/components/media/folders";
import { MediaDetail } from "@/components/media/media-detail";
import { MediaDropArea, UploadButton } from "@/components/media/media-drop-area";
import { MediaGrid, MediaTable } from "@/components/media/media-list";
import { MessagePanel } from "@/components/message-panel";
import { Icon } from "@/components/shell/icon";
import { getClientConfig } from "@/lib/client-config";
import { FALLBACK_CONTENT_LOCALES } from "@/lib/content";
import { optional } from "@/lib/content-server";
import { isForbidden, isNotFound, load, loadTagged } from "@/lib/core";
import {
  formatBytes,
  MEDIA_KINDS,
  type MediaKind,
  mediaHref,
  mediaQuery,
  parseMediaFilters,
  type UploadLimits,
} from "@/lib/media";
import { MEDIA_PURGE, MEDIA_READ, MEDIA_WRITE } from "@/lib/permissions";
import { can } from "@/lib/viewer";

// Màn "Thư viện media" (module `media`): lưới hay bảng tệp, lọc theo loại, thư mục, thẻ, thiếu alt
// (`alt_missing`, core lọc cả thư viện), riêng tư, thùng rác; khung chi tiết của tệp đang mở
// (`?item=`). Số ở đầu trang là tóm tắt cả thư viện (`GET /media/summary`). Ngôn ngữ alt và giới
// hạn tải lên theo cấu hình của máy chủ (`GET /kernel/client-config`). Bộ lọc nằm trên địa chỉ nên
// mở thẳng được và nút quay lại chạy đúng. Ảnh hiện qua route `/media/{id}/content` của giao diện.
export default async function MediaPage(props: PageProps<"/content/media">) {
  const t = await getTranslations("media");
  const locale = await getLocale();
  const filters = parseMediaFilters(await props.searchParams);

  let page: Awaited<ReturnType<typeof loadPage>>;
  try {
    page = await loadPage(filters);
  } catch (error) {
    if (isForbidden(error)) {
      const errors = await getTranslations("errors");
      return (
        <MessagePanel
          title={errors("forbiddenTitle")}
          message={errors("forbidden", { permission: MEDIA_READ })}
        />
      );
    }
    throw error;
  }

  const [folders, tags, selected, ai, canWrite, canPurge, summary, config] = await Promise.all([
    optional(
      load((c) =>
        c.GET("/api/v1/media/folders", {
          params: { query: { limit: 200, sort: "name", order: "asc" } },
        }),
      ),
    ),
    optional(
      load((c) =>
        c.GET("/api/v1/media/tags", {
          params: { query: { limit: 200, sort: "name", order: "asc" } },
        }),
      ),
    ),
    filters.item ? loadItem(filters.item) : Promise.resolve(null),
    optional(load((c) => c.GET("/api/v1/ai/status"))),
    can(MEDIA_WRITE),
    can(MEDIA_PURGE),
    optional(load((c) => c.GET("/api/v1/media/summary"))),
    getClientConfig(),
  ]);

  const items = page.data;
  const library = summary?.data ?? null;
  const media = config?.media;
  const limits: UploadLimits | null = media
    ? { maxBytes: media.max_bytes, allowedTypes: media.allowed_types }
    : null;
  // Ngôn ngữ alt máy chủ nhận (`AUTOXIDE_MEDIA_ALT_LOCALES`); core cũ thì ngôn ngữ của nội dung.
  const altLocales = media?.alt_locales.length ? media.alt_locales : [...FALLBACK_CONTENT_LOCALES];
  // Tên người tải lên chỉ có ở danh sách (`include=uploader`): lấy từ dòng của tệp đang mở.
  const uploaderName =
    page.data.find((item) => item.id === selected?.item.id)?.uploaded_by_name ?? null;
  const folderList = folders?.data ?? [];
  const current = filters.folder && filters.folder !== "root" ? filters.folder : undefined;
  const aiImages = Boolean(ai?.data.enabled && ai.data.images);

  return (
    <div className="page md-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb">{t("crumb")}</span>
          <h1 className="h1">{t("title")}</h1>
          {library ? (
            <p className="pdesc num">
              {t("librarySummary", {
                count: library.items,
                size: formatBytes(library.bytes, locale),
                noAlt: library.images_missing_alt,
                trashed: library.trashed_items,
              })}
            </p>
          ) : null}
        </div>
        {canWrite && !filters.trash ? (
          <div className="headacts">
            <NewFolderDialog parentId={current} />
            <UploadButton inputId="md-file" label={t("upload.button")} />
          </div>
        ) : null}
      </section>

      {canWrite && !filters.trash ? (
        <MediaDropArea
          inputId="md-file"
          folderId={filters.folder}
          folderName={current ? (folderList.find((f) => f.id === current)?.name ?? "") : ""}
          limits={limits}
        />
      ) : null}

      <div className="md-filters">
        <form className="md-search" action="/content/media">
          {Object.entries({
            folder: filters.folder,
            kind: filters.kind,
            tag: filters.tag,
            alt: filters.noAlt ? "missing" : undefined,
            visibility: filters.visibility,
            trash: filters.trash ? "1" : undefined,
            view: filters.view,
          }).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null,
          )}
          <label className="vh" htmlFor="md-q">
            {t("search")}
          </label>
          <input
            id="md-q"
            className="inp"
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={t("search")}
          />
        </form>
        <div className="chips md-chiprow">
          <details className="md-menu">
            <summary className={filters.kind ? "chip on" : "chip"}>
              <Icon name="filter" small />
              {filters.kind
                ? t("filter.label", { kind: t(`kinds.${filters.kind}`) })
                : t("filter.all")}
              <Icon name="chev" small />
            </summary>
            <div className="md-menu-pop" role="menu" aria-label={t("filter.menu")}>
              <Link
                role="menuitemradio"
                aria-checked={!filters.kind}
                className="btn ghost"
                href={mediaHref(filters, { kind: undefined })}
              >
                {t("filter.any")}
              </Link>
              {(Object.keys(MEDIA_KINDS) as MediaKind[]).map((kind) => (
                <Link
                  key={kind}
                  role="menuitemradio"
                  aria-checked={filters.kind === kind}
                  className="btn ghost"
                  href={mediaHref(filters, { kind })}
                >
                  {t(`kinds.${kind}`)}
                </Link>
              ))}
            </div>
          </details>
          <Link
            className={filters.noAlt ? "chip on" : "chip"}
            href={mediaHref(filters, { noAlt: !filters.noAlt })}
            aria-current={filters.noAlt ? "true" : undefined}
          >
            <Icon name="warn" small />
            {t("filter.noAlt")}
            {library ? <span className="cnt hot">{library.images_missing_alt}</span> : null}
          </Link>
          <Link
            className={filters.visibility === "private" ? "chip on" : "chip"}
            href={mediaHref(filters, {
              visibility: filters.visibility === "private" ? undefined : "private",
            })}
            aria-current={filters.visibility === "private" ? "true" : undefined}
          >
            <Icon name="lock" small />
            {t("filter.private")}
          </Link>
          <Link
            className={filters.trash ? "chip on" : "chip"}
            href={mediaHref(filters, { trash: !filters.trash, item: undefined })}
            aria-current={filters.trash ? "true" : undefined}
          >
            <Icon name="trash" small />
            {t("filter.trash")}
          </Link>
          {(tags?.data.length ?? 0) > 0 ? (
            <details className="md-menu">
              <summary className={filters.tag ? "chip on" : "chip"}>
                #{filters.tag ?? t("filter.tags")}
                <Icon name="chev" small />
              </summary>
              <div className="md-menu-pop" role="menu" aria-label={t("filter.tags")}>
                <Link
                  role="menuitemradio"
                  aria-checked={!filters.tag}
                  className="btn ghost"
                  href={mediaHref(filters, { tag: undefined })}
                >
                  {t("filter.anyTag")}
                </Link>
                {tags?.data.map((tag) => (
                  <Link
                    key={tag.id}
                    role="menuitemradio"
                    aria-checked={filters.tag?.toLowerCase() === tag.name.toLowerCase()}
                    className="btn ghost"
                    href={mediaHref(filters, { tag: tag.name })}
                  >
                    #{tag.name} <span className="cnt">{tag.item_count}</span>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </div>
        <nav className="seg hide-mobile" aria-label={t("view.label")}>
          <Link
            className={filters.view === "table" ? "" : "on"}
            href={mediaHref(filters, { view: "grid" })}
            aria-current={filters.view === "table" ? undefined : "true"}
          >
            <Icon name="grid" small />
            {t("view.grid")}
          </Link>
          <Link
            className={filters.view === "table" ? "on" : ""}
            href={mediaHref(filters, { view: "table" })}
            aria-current={filters.view === "table" ? "true" : undefined}
          >
            <Icon name="menu" small />
            {t("view.table")}
          </Link>
        </nav>
      </div>

      {filters.trash ? null : (
        <FolderBar folders={folderList} filters={filters} canWrite={canWrite} />
      )}
      {filters.trash ? <p className="note">{t("trashNote")}</p> : null}

      <div className={selected ? "md-body has-pane" : "md-body"}>
        <section className="md-main" aria-label={t("listLabel")}>
          {items.length === 0 ? (
            <div className="card empty md-empty">
              <b>{t("empty")}</b>
              <span>{t("emptyHint")}</span>
            </div>
          ) : filters.view === "table" ? (
            <div className="card tcard">
              <MediaTable items={items} filters={filters} folders={folderList} />
            </div>
          ) : (
            <MediaGrid items={items} filters={filters} />
          )}
          {filters.cursor || page.pagination.next_cursor ? (
            <nav className="pager" aria-label={t("pages")}>
              {filters.cursor ? (
                <Link className="btn" href={mediaHref(filters, { cursor: undefined })}>
                  {t("first")}
                </Link>
              ) : null}
              {page.pagination.next_cursor ? (
                <Link
                  className="btn"
                  rel="next"
                  href={mediaHref(filters, { cursor: page.pagination.next_cursor })}
                >
                  {t("next")}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
        {filters.item && !selected ? (
          <aside className="card md-pane" aria-label={t("detail.title")}>
            <p className="empty">{t("detail.gone")}</p>
          </aside>
        ) : null}
        {selected ? (
          <MediaDetail
            key={`${selected.item.id}:${selected.version}`}
            item={selected.item}
            version={selected.version}
            folders={folderList}
            closeHref={mediaHref(filters, { item: undefined })}
            can={{ write: canWrite, purge: canPurge }}
            ai={{
              enabled: aiImages,
              reason: ai ? (ai.data.enabled ? "images" : "off") : "forbidden",
            }}
            locales={altLocales}
            uploaderName={uploaderName}
          />
        ) : null}
      </div>
    </div>
  );
}

function loadPage(filters: ReturnType<typeof parseMediaFilters>) {
  return load((client) => client.GET("/api/v1/media", { params: { query: mediaQuery(filters) } }));
}

/** Tệp đang mở và phiên bản (`ETag`) của nó; `null` khi không còn. */
async function loadItem(id: string) {
  try {
    const { data, etag } = await loadTagged((client) =>
      client.GET("/api/v1/media/{id}", { params: { path: { id } } }),
    );
    return { item: data.data, version: etag ?? "" };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}
