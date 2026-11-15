import Form from "next/form";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CONTENT_LOCALES, type Entry, type ListFilters } from "@/lib/content";
import { EntryStatusBadges } from "./status";

/** Ô tìm và lọc theo loại, ngôn ngữ. Form GET: kết quả nằm trên địa chỉ, chạy cả khi chưa có JS. */
export function EntryFilters({ filters }: { filters: ListFilters }) {
  const t = useTranslations("content.list");
  const locales = useTranslations("content.locales");
  return (
    <Form action="/content" className="ce-filters" role="search" aria-label={t("filterLabel")}>
      {filters.status !== "all" ? (
        <input type="hidden" name="status" value={filters.status} />
      ) : null}
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
          {CONTENT_LOCALES.map((code) => (
            <option key={code} value={code}>
              {locales(code)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn">
        {t("apply")}
      </button>
      {filters.q || filters.kind || filters.locale ? (
        <Link
          className="btn ghost"
          href={filters.status === "all" ? "/content" : `/content?status=${filters.status}`}
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
                    {kinds(entry.kind)} · <span className="mono">/{entry.slug}</span>
                    {entry.ai_generated ? ` · ${t("ai")}` : ""}
                  </span>
                </span>
              </Td>
              <Td label={t("colStatus")}>
                <EntryStatusBadges entry={entry} />
              </Td>
              <Td label={t("colLocale")}>
                <span className="loc">{entry.locale.toUpperCase()}</span>
              </Td>
              <Td label={t("colAuthors")}>{names.length > 0 ? names.join(", ") : "—"}</Td>
              <Td label={t("colUpdated")}>
                <Time value={entry.updated_at} />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
