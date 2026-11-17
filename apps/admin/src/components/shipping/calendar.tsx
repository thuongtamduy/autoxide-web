import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  type CalendarDay,
  longDay,
  monthTitle,
  shiftMonth,
  weekdayNames,
} from "@/lib/shipping-calendar";

/** Địa chỉ của tab với tháng và ngày đang chọn. */
export function calendarHref(month: string, day?: string): string {
  const q = new URLSearchParams({ month });
  if (day) q.set("day", day);
  return `/sales/shipping/calendar?${q.toString()}`;
}

/** Chữ mô tả một ngày cho trình đọc màn hình và chú thích ô. */
function useDayText() {
  const t = useTranslations("shipping.calendar");
  return (d: CalendarDay): string =>
    d.kind === "holiday"
      ? t("cellHoliday", { name: d.holidays.join(", ") })
      : d.kind === "pickup"
        ? t("cellCutoff", { time: d.cutoff ?? "" })
        : t("cellOff");
}

/**
 * Lịch tháng của tab "Lịch giao" (như lịch của Google Calendar, Shopify): lưới 7 cột từ thứ Hai, ô
 * ngày hãng lấy hàng ghi giờ chốt, ngày nghỉ ghi tên, ngày không lấy hàng mờ. Mỗi ô là một liên kết
 * `?day=` (mở thẳng được, nút quay lại chạy đúng); trang hiện chi tiết ngày đang chọn bên cạnh.
 */
export function MonthCalendar({
  month,
  selected,
  weeks,
  today,
}: {
  month: string;
  selected: string;
  weeks: readonly CalendarDay[][];
  today: string;
}) {
  const t = useTranslations("shipping.calendar");
  const locale = useLocale();
  const text = useDayText();
  const names = weekdayNames(locale);
  const narrow = weekdayNames(locale, "narrow");
  const title = monthTitle(month, locale);
  const thisMonth = today.slice(0, 7);
  return (
    <div className="card sc-cal">
      <div className="sc-cal-head">
        <h2 className="h2" id="sc-month">
          {title}
        </h2>
        <nav className="sc-nav" aria-label={t("monthNav")}>
          <Link
            className="btn sm"
            href={calendarHref(shiftMonth(month, -1))}
            scroll={false}
            aria-label={t("prevMonth")}
            title={t("prevMonth")}
          >
            <span aria-hidden="true">‹</span>
          </Link>
          <Link
            className="btn sm"
            href={calendarHref(thisMonth, today)}
            scroll={false}
            aria-current={month === thisMonth ? "date" : undefined}
          >
            {t("thisMonth")}
          </Link>
          <Link
            className="btn sm"
            href={calendarHref(shiftMonth(month, 1))}
            scroll={false}
            aria-label={t("nextMonth")}
            title={t("nextMonth")}
          >
            <span aria-hidden="true">›</span>
          </Link>
        </nav>
      </div>
      <table className="sc-grid" aria-labelledby="sc-month">
        <thead>
          <tr>
            {names.map((name, i) => (
              <th key={name} scope="col" abbr={name}>
                <span className="sc-wd-long">{name}</span>
                <span className="sc-wd-short" aria-hidden="true">
                  {narrow[i]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.day}>
              {week.map((d) => {
                const label = [
                  longDay(d.day, locale),
                  d.isToday ? t("today") : "",
                  text(d),
                  ...d.local.map((h) => t("cellLocal", { name: h.name })),
                  d.starts ? t("cellNew") : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <td
                    key={d.day}
                    className={`sc-day sc-${d.kind}${d.inMonth ? "" : " sc-out"}${d.isPast ? " sc-past" : ""}`}
                  >
                    <Link
                      href={calendarHref(month, d.day)}
                      scroll={false}
                      aria-label={label}
                      aria-current={d.day === selected ? "true" : undefined}
                      data-today={d.isToday ? "" : undefined}
                    >
                      <span className="sc-num">{Number(d.day.slice(8))}</span>
                      <span className="sc-note" aria-hidden="true">
                        {d.kind === "holiday"
                          ? d.holidays.join(", ")
                          : d.kind === "pickup"
                            ? d.cutoff
                            : t("cellOffShort")}
                      </span>
                      {d.local.length > 0 || d.starts ? (
                        <span className="sc-flags" aria-hidden="true">
                          {d.local.length > 0 ? <span className="sc-flag sc-flag-local" /> : null}
                          {d.starts ? <span className="sc-flag sc-flag-new" /> : null}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="sc-legend" aria-label={t("legend")}>
        <li>
          <span className="sc-key sc-key-pickup" aria-hidden="true" />
          {t("legendPickup")}
        </li>
        <li>
          <span className="sc-key sc-key-holiday" aria-hidden="true" />
          {t("legendHoliday")}
        </li>
        <li>
          <span className="sc-key sc-key-off" aria-hidden="true" />
          {t("legendOff")}
        </li>
        <li>
          <span className="sc-flag sc-flag-local" aria-hidden="true" />
          {t("legendLocal")}
        </li>
        <li>
          <span className="sc-flag sc-flag-new" aria-hidden="true" />
          {t("legendNew")}
        </li>
      </ul>
    </div>
  );
}
