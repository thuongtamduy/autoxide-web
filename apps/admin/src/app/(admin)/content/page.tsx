import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EntryFilters, EntryTable, UpcomingTable } from "@/components/content/entry-list";
import { RequiredPages, SiteChips } from "@/components/content/sample-sites";
import { MessagePanel } from "@/components/message-panel";
import { Icon } from "@/components/shell/icon";
import { Pager } from "@/components/ui/pager";
import { contentLocales } from "@/lib/client-config";
import {
  abilities,
  filtersHref,
  filtersKeep,
  hasFilters,
  type ListFilters,
  listQuery,
  PAGE_SIZE,
  parseFilters,
  STATUS_TABS,
} from "@/lib/content";
import { loadAuthors } from "@/lib/content-server";
import { isForbidden, load } from "@/lib/core";
import { ownerFilter } from "@/lib/org-server";
import { getMe } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { listWebsites, websiteChecklist } from "@/sample/content";

// Màn "Bài viết": mọi bài và trang (cả bản nháp), lọc theo trạng thái, chờ duyệt, loại, ngôn ngữ,
// chữ, bài của tôi, nhãn AI, bản dịch còn thiếu — mọi bộ lọc do core lọc trên cả danh sách. Tab
// "Sắp đăng" là lịch đăng / gỡ đang chờ của mọi bài. Bộ lọc nằm trên địa chỉ (`?status=draft&q=…`)
// nên mở thẳng được và nút quay lại chạy đúng.
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
  const authors = page.kind === "entries" ? (await loadAuthors()).items : [];
  const names = Object.fromEntries(authors.map((a) => [a.id, a.display_name]));
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

          {page.kind === "entries" ? (
            <EntryFilters filters={filters} locales={(await contentLocales()).content} />
          ) : null}
          {page.kind === "upcoming" ? <p className="fhint">{t("list.upcomingAbout")}</p> : null}

          <div className="card tcard">
            {page.kind === "entries" ? (
              <EntryTable
                entries={page.data}
                authors={names}
                filtered={hasFilters(filters) || filters.status !== "all"}
                can={can}
                status={filters.status}
                sort={{ field: "updated", dir: filters.oldest ? "asc" : "desc" }}
                keep={filtersKeep(filters)}
              />
            ) : (
              <UpcomingTable schedules={page.data} entries={page.entries} />
            )}
          </div>

          {/* Core phân trang theo con trỏ, không trả tổng: chỉ "Trang đầu" / "Trang sau". */}
          <Pager
            first={filters.cursor ? filtersHref(filters) : null}
            next={
              page.pagination.next_cursor
                ? filtersHref(filters, { cursor: page.pagination.next_cursor })
                : null
            }
          />
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

/** Trang đang xem: bảng bài, hay (tab "Sắp đăng") lịch đang chờ kèm bài có lịch. */
async function loadPage(filters: ListFilters) {
  if (filters.status !== "scheduled") {
    // Nút đang chọn ở góc trên trái: chỉ bài của nút đó (`owner_org`).
    const owner = await ownerFilter();
    const page = await load((client) =>
      client.GET("/api/v1/content/entries", {
        params: { query: { ...listQuery(filters), ...owner } },
      }),
    );
    return { kind: "entries" as const, ...page };
  }
  const [schedules, entries] = await Promise.all([
    load((client) =>
      client.GET("/api/v1/content/schedules", {
        params: {
          query: {
            status: "scheduled",
            limit: PAGE_SIZE,
            ...(filters.cursor ? { cursor: filters.cursor } : {}),
          },
        },
      }),
    ),
    // Tên bài cho từng lịch: mọi bài đang có lịch chờ, một lần đọc (không đọc từng bài).
    load((client) =>
      client.GET("/api/v1/content/entries", {
        params: { query: { scheduled: true, limit: 200 } },
      }),
    ),
  ]);
  return { kind: "upcoming" as const, ...schedules, entries: entries.data };
}

/** Phần dữ liệu mẫu (W-006): website đang chọn và trang bắt buộc của nó. */
async function loadSample(site: string | undefined) {
  const { data: websites } = await listWebsites();
  const website = websites.find((w) => w.id === site) ?? websites[0];
  if (!website) return null;
  const checklist = await websiteChecklist(website.id);
  return checklist.ok ? { websites, website, checklist: checklist.data } : null;
}
