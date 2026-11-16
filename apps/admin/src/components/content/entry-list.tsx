import Form from "next/form";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import {
  type Entry,
  entryPath,
  filtersHref,
  hasFilters,
  type ListFilters,
  type Schedule,
  upcomingRows,
} from "@/lib/content";
import { EntryStatusBadges } from "./status";

/**
 * Ô tìm và lọc theo loại, ngôn ngữ, bản dịch còn thiếu; chip "Bài của tôi", "Có nhãn AI". Mọi bộ
 * lọc là tham số của `GET /content/entries` (core lọc cả danh sách, không chỉ trang đang xem).
 * Form GET: kết quả nằm trên địa chỉ, chạy cả khi chưa có JS.
 */
/** `locales`: ngôn ngữ của nội dung theo cấu hình của core (trang đọc bằng `contentLocales()`). */
export function EntryFilters({
  filters,
  locales,
}: {
  filters: ListFilters;
  locales: readonly string[];
}) {
  const t = useTranslations("content.list");
  return (
    <>
      <nav className="chips ce-chips" aria-label={t("chipsLabel")}>
        {(["mine", "ai"] as const).map((key) => (
          <Link
            key={key}
            className={filters[key] ? "chip on" : "chip"}
            href={filtersHref(filters, { [key]: !filters[key] })}
            aria-current={filters[key] ? "true" : undefined}
          >
            {t(`chips.${key}`)}
          </Link>
        ))}
      </nav>
      <FilterForm filters={filters} localeList={locales} />
    </>
  );
}

function FilterForm({
  filters,
  localeList,
}: {
  filters: ListFilters;
  localeList: readonly string[];
}) {
  const t = useTranslations("content.list");
  const locales = useTranslations("content.locales");
  return (
    <Form action="/content" className="ce-filters" role="search" aria-label={t("filterLabel")}>
      {filters.site ? <input type="hidden" name="site" value={filters.site} /> : null}
      {filters.status !== "all" ? (
        <input type="hidden" name="status" value={filters.status} />
      ) : null}
      {filters.mine ? <input type="hidden" name="mine" value="1" /> : null}
      {filters.ai ? <input type="hidden" name="ai" value="1" /> : null}
      {filters.term ? <input type="hidden" name="term" value={filters.term} /> : null}
      {filters.author ? <input type="hidden" name="author" value={filters.author} /> : null}
      <label className="ce-search">
        <span className="vh">{t("search")}</span>
        <input
          className="inp"
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder={t("searchHint")}
          maxLength={200}
        />
      </label>
      <label className="ce-select">
        <span className="vh">{t("kind")}</span>
        <select className="inp" name="kind" defaultValue={filters.kind ?? ""}>
          <option value="">{t("allKinds")}</option>
          <option value="post">{t("posts")}</option>
          <option value="page">{t("pagesKind")}</option>
        </select>
      </label>
      <label className="ce-select">
        <span className="vh">{t("locale")}</span>
        <select className="inp" name="locale" defaultValue={filters.locale ?? ""}>
          <option value="">{t("allLocales")}</option>
          {localeList.map((code) => (
            <option key={code} value={code}>
              {locales(code)}
            </option>
          ))}
        </select>
      </label>
      <label className="ce-select">
        <span className="vh">{t("missing")}</span>
        <select className="inp" name="missing" defaultValue={filters.missing ?? ""}>
          <option value="">{t("anyTranslation")}</option>
          {localeList.map((code) => (
            <option key={code} value={code}>
              {t("missingIn", { language: locales(code) })}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn">
        {t("apply")}
      </button>
      {hasFilters(filters) ? (
        <Link
          className="btn ghost"
          href={filtersHref({
            status: filters.status,
            ...(filters.site ? { site: filters.site } : {}),
          })}
        >
          {t("clear")}
        </Link>
      ) : null}
    </Form>
  );
}

/** Bảng bài viết; trên điện thoại mỗi bài là một thẻ, mỗi ô có nhãn cột. */
export function EntryTable({
  entries,
  authors,
  filtered,
}: {
  entries: Entry[];
  /** Tên hiển thị theo id hồ sơ tác giả. */
  authors: Record<string, string>;
  filtered: boolean;
}) {
  const t = useTranslations("content.list");
  const kinds = useTranslations("content.kinds");
  if (entries.length === 0) {
    return <p className="empty">{filtered ? t("noMatch") : t("empty")}</p>;
  }
  return (
    <Table cards>
      <thead>
        <tr>
          <Th>{t("colTitle")}</Th>
          <Th>{t("colStatus")}</Th>
          <Th>{t("colLocale")}</Th>
          <Th>{t("colAuthors")}</Th>
          <Th>{t("colUpdated")}</Th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const names = entry.author_ids.map((id) => authors[id]).filter(Boolean);
          return (
            <tr key={entry.id}>
              <Td className="rt-title">
                <span className="cell2">
                  <Link href={`/content/${entry.id}`} className="ce-title-link">
                    {entry.title || t("untitled")}
                  </Link>
                  <span className="sub ell">
                    {kinds(entry.kind)} · <span className="mono">{entryPath(entry)}</span>
                    {entry.ai_generated ? ` · ${t("ai")}` : ""}
                  </span>
                </span>
              </Td>
              <Td label={t("colStatus")}>
                <span className="cell2">
                  <EntryStatusBadges entry={entry} />
                  {entry.published_at ? (
                    <span className="sub">
                      {t("publishedAt")} <Time value={entry.published_at} />
                    </span>
                  ) : null}
                </span>
              </Td>
              <Td label={t("colLocale")}>
                <span className="loc">{entry.locale.toUpperCase()}</span>
              </Td>
              <Td label={t("colAuthors")}>{names.length > 0 ? names.join(", ") : "—"}</Td>
              <Td label={t("colUpdated")} className="ce-nowrap">
                <Time value={entry.updated_at} />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/**
 * "Sắp đăng": lịch đăng và gỡ đang chờ của mọi bài, giờ chạy sớm nhất trước. Tên bài lấy từ danh
 * sách bài có lịch (`scheduled=true`), cùng một lần đọc cho cả trang.
 */
export function UpcomingTable({ schedules, entries }: { schedules: Schedule[]; entries: Entry[] }) {
  const t = useTranslations("content.list");
  const kinds = useTranslations("content.kinds");
  const rows = upcomingRows(schedules, entries);
  if (rows.length === 0) return <p className="empty">{t("noUpcoming")}</p>;
  return (
    <Table cards>
      <thead>
        <tr>
          <Th>{t("colRunAt")}</Th>
          <Th>{t("colAction")}</Th>
          <Th>{t("colTitle")}</Th>
          <Th>{t("colStatus")}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ schedule, entry }) => (
          <tr key={schedule.id}>
            <Td label={t("colRunAt")} className="ce-nowrap">
              <Time value={schedule.run_at} />
            </Td>
            <Td label={t("colAction")}>
              <span className={schedule.action === "publish" ? "badge b-sched" : "badge b-arch"}>
                {t(`action.${schedule.action}`)}
              </span>
              {schedule.ai_reviewed ? <span className="sub"> · {t("aiReviewed")}</span> : null}
            </Td>
            <Td className="rt-title">
              <span className="cell2">
                <Link href={`/content/${schedule.entry_id}`} className="ce-title-link">
                  {entry ? entry.title || t("untitled") : t("entryGone")}
                </Link>
                {entry ? (
                  <span className="sub ell">
                    {kinds(entry.kind)} · {entry.locale.toUpperCase()} ·{" "}
                    <span className="mono">{entryPath(entry)}</span>
                  </span>
                ) : null}
              </span>
            </Td>
            <Td label={t("colStatus")}>{entry ? <EntryStatusBadges entry={entry} /> : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
