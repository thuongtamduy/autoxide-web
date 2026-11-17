import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatCount } from "@/lib/format";
import { type Keep, PER_PAGE, pageWindow, withQuery } from "@/lib/table";
import { AutoFilter } from "./auto-filter";

type PagerProps =
  | {
      /** Tổng số dòng khớp bộ lọc (nguồn dữ liệu có tổng). */
      total: number;
      page: number;
      per: number;
      base: string;
      /** Tham số đang có trên địa chỉ (bộ lọc, cách sắp), giữ khi đổi trang. */
      keep: Keep;
      options?: readonly number[];
    }
  | {
      /** API theo con trỏ, không có tổng: chỉ "Trang đầu" và "Trang sau" (không bịa tổng). */
      first: string | null;
      next: string | null;
    };

/**
 * Phân trang dưới bảng. Có tổng: "1–25 trong 312", Trước / Sau, chọn số dòng mỗi trang (form GET,
 * đổi là áp ngay). Theo con trỏ: chỉ hai nút như cũ.
 */
export function Pager(props: PagerProps) {
  const t = useTranslations("table");
  const locale = useLocale();
  if (!("total" in props)) {
    if (!props.first && !props.next) return null;
    return (
      <nav className="pager" aria-label={t("pages")}>
        {props.first ? (
          <Link className="btn sm" href={props.first}>
            {t("first")}
          </Link>
        ) : null}
        {props.next ? (
          <Link className="btn sm" href={props.next} rel="next">
            {t("nextPage")}
          </Link>
        ) : null}
      </nav>
    );
  }
  const { total, per, base, keep, options = PER_PAGE } = props;
  const win = pageWindow(props.page, per, total);
  const href = (page: number) =>
    withQuery(base, keep, {
      page: page === 1 ? null : page,
      per: per === (options[0] ?? PER_PAGE[0]) ? null : per,
    });
  const hidden = Object.entries(keep).filter(
    ([key, value]) =>
      key !== "page" &&
      key !== "per" &&
      key !== "cursor" &&
      value !== null &&
      value !== undefined &&
      value !== "",
  );
  return (
    <nav className="pager tpager" aria-label={t("pages")}>
      <span className="tpager-range">
        {total === 0
          ? t("rangeEmpty")
          : t("range", {
              from: formatCount(win.from, locale),
              to: formatCount(win.to, locale),
              total: formatCount(total, locale),
            })}
      </span>
      {total > (options[0] ?? PER_PAGE[0]) ? (
        <form className="tpager-per" action={base}>
          <AutoFilter />
          {hidden.map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={String(value)} />
          ))}
          <label className="lab" htmlFor="tpager-per">
            {t("perPage")}
          </label>
          <select id="tpager-per" className="inp" name="per" defaultValue={String(per)}>
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button type="submit" className="btn sm">
            {t("show")}
          </button>
        </form>
      ) : null}
      {win.last > 1 ? (
        <span className="tpager-nav">
          {win.prev ? (
            <Link className="btn sm" href={href(win.prev)} rel="prev">
              {t("prev")}
            </Link>
          ) : (
            <span className="btn sm" aria-disabled="true">
              {t("prev")}
            </span>
          )}
          {win.next ? (
            <Link className="btn sm" href={href(win.next)} rel="next">
              {t("next")}
            </Link>
          ) : (
            <span className="btn sm" aria-disabled="true">
              {t("next")}
            </span>
          )}
        </span>
      ) : null}
    </nav>
  );
}
