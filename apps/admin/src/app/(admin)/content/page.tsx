import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EntryFilters, EntryTable } from "@/components/content/entry-list";
import { RequiredPages, SiteChips } from "@/components/content/sample-sites";
import { MessagePanel } from "@/components/message-panel";
import { Icon } from "@/components/shell/icon";
import { abilities, filtersHref, listQuery, parseFilters, STATUS_TABS } from "@/lib/content";
import { loadAuthors } from "@/lib/content-server";
import { isForbidden, load } from "@/lib/core";
import { getMe } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { listWebsites, websiteChecklist } from "@/sample/content";

// Màn "Bài viết": mọi bài và trang (cả bản nháp), lọc theo trạng thái, loại, ngôn ngữ và chữ.
// Bộ lọc nằm trên địa chỉ (`?status=draft&q=…`) nên mở thẳng được và nút quay lại chạy đúng.
export default async function ContentPage(props: PageProps<"/content">) {
  const t = await getTranslations("content");
  const filters = parseFilters(await props.searchParams);
  const me = await getMe();
  const can = abilities(me);

  let page: Awaited<ReturnType<typeof loadPage>>;
  try {
    page = await loadPage(filters);
  } catch (error) {
    if (isForbidden(error)) {
      const errors = await getTranslations("errors");
      return (
        <MessagePanel
          title={errors("forbiddenTitle")}
          message={errors("forbidden", { permission: "content.read" })}
        />
      );
    }
    throw error;
  }
  const authors = await loadAuthors();
  const names = Object.fromEntries(authors.map((a) => [a.id, a.display_name]));
  const filtered = Boolean(filters.kind || filters.locale || filters.q);
  const sample = sampleDataEnabled() ? await loadSample(filters.site) : null;

  return (
    <div className="page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb">{t("crumb")}</span>
          <h1 className="h1">{t("list.title")}</h1>
          <p className="pdesc">{t("list.description")}</p>
        </div>
        {can.write ? (
          <div className="headacts ce-headacts">
            <Link className="btn" href="/content/new?kind=page">
              <Icon name="plus" />
              {t("list.newPage")}
            </Link>
            <Link className="btn pri" href="/content/new">
              <Icon name="plus" />
              {t("list.newPost")}
            </Link>
          </div>
        ) : null}
      </section>

      {sample ? (
        <SiteChips
          websites={sample.websites}
          current={sample.website.id}
          hrefFor={Object.fromEntries(
            sample.websites.map((w) => [w.id, filtersHref(filters, { site: w.id })]),
          )}
        />
      ) : null}

      <div className="ce-listgrid">
        <div className="ce-listmain">
          <nav className="ptabs" aria-label={t("list.statusLabel")}>
            {STATUS_TABS.map((status) => {
              const on = filters.status === status;
              return (
                <Link
                  key={status}
                  href={filtersHref(filters, { status })}
                  className={on ? "stab on" : "stab"}
                  aria-current={on ? "page" : undefined}
                >
                  {t(`list.tabs.${status}`)}
                </Link>
              );
            })}
          </nav>

          <EntryFilters filters={filters} />

          <div className="card tcard">
            <EntryTable
              entries={page.data}
              authors={names}
              filtered={filtered || filters.status !== "all"}
            />
          </div>

          {filters.cursor || page.pagination.next_cursor ? (
            <nav className="pager" aria-label={t("list.pages")}>
              {filters.cursor ? (
                <Link className="btn" href={filtersHref(filters)}>
                  {t("list.first")}
                </Link>
              ) : null}
              {page.pagination.next_cursor ? (
                <Link
                  className="btn"
                  href={filtersHref(filters, { cursor: page.pagination.next_cursor })}
                  rel="next"
                >
                  {t("list.next")}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
        {sample ? (
          <aside className="ce-listside">
            <RequiredPages website={sample.website} checklist={sample.checklist} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function loadPage(filters: ReturnType<typeof parseFilters>) {
  return load((client) =>
    client.GET("/api/v1/content/entries", { params: { query: listQuery(filters) } }),
  );
}

/** Phần dữ liệu mẫu (W-006): website đang chọn và trang bắt buộc của nó. */
async function loadSample(site: string | undefined) {
  const { data: websites } = await listWebsites();
  const website = websites.find((w) => w.id === site) ?? websites[0];
  if (!website) return null;
  const checklist = await websiteChecklist(website.id);
  return checklist.ok ? { websites, website, checklist: checklist.data } : null;
}
