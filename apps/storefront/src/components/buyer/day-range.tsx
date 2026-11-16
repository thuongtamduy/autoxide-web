// Ngày giao: một cách ghi cho mọi trang (bản thiết kế, mục lặp lại 11): "Thứ Bảy 21/11 – Thứ Hai 23/11";
// điện thoại hiện bản ngắn "Thứ 7 21/11 – Thứ 2 23/11" (lớp `.dr-l` / `.dr-s`). Tên thứ lấy từ `Intl`
// theo ngôn ngữ, ngày là ngày lịch (`YYYY-MM-DD`, đã theo giờ Việt Nam).

function dayText(day: string, locale: string, style: "long" | "short"): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    weekday: style,
    timeZone: "UTC",
  }).format(date);
  if (locale === "vi") return `${weekday} ${day.slice(8, 10)}/${day.slice(5, 7)}`;
  const rest = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
  return `${weekday} ${rest}`;
}

/** Chữ của một khoảng ngày (dùng cho câu, vd ô `title`). */
export function dayRangeText(
  days: readonly [string, string],
  locale: string,
  style: "long" | "short" = "long",
): string {
  const [from, to] = days;
  return from === to
    ? dayText(from, locale, style)
    : `${dayText(from, locale, style)} – ${dayText(to, locale, style)}`;
}

export function DayRange({ days, locale }: { days: readonly [string, string]; locale: string }) {
  return (
    <>
      <span className="dr-l">{dayRangeText(days, locale, "long")}</span>
      <span className="dr-s">{dayRangeText(days, locale, "short")}</span>
    </>
  );
}

/**
 * Giờ và ngày theo giờ Việt Nam: "10:58 · 13/11/2026" (vi) / "10:58 · 13 Nov 2026" (en); `short` bỏ năm
 * (các mốc của đơn, ô hẹp).
 */
export function formatDateTime(iso: string, locale: string, short = false): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    ...(locale === "vi"
      ? { day: "2-digit", month: "2-digit", ...(short ? {} : { year: "numeric" }) }
      : { day: "numeric", month: "short", ...(short ? {} : { year: "numeric" }) }),
  }).format(date);
  return `${time} · ${day}`;
}
