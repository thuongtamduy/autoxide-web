"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

const STYLE: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
const DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

/**
 * Một thời điểm, theo múi giờ của máy người xem. Máy chủ không biết múi giờ đó, nên lần render
 * đầu (ở máy chủ) ghi giờ UTC kèm chữ "UTC"; trình duyệt đổi sang giờ địa phương ngay sau khi tải.
 */
export function Time({ value, date: dateOnly = false }: { value: string; date?: boolean }) {
  const locale = useLocale();
  const date = new Date(value);
  // `date`: chỉ ngày (vd kỳ thanh toán), không cần giờ.
  const style = dateOnly ? DATE : STYLE;
  const [text, setText] = useState(
    () => `${new Intl.DateTimeFormat(locale, { ...style, timeZone: "UTC" }).format(date)} UTC`,
  );
  useEffect(() => {
    setText(new Intl.DateTimeFormat(locale, style).format(new Date(value)));
  }, [locale, value, style]);
  return <time dateTime={value}>{text}</time>;
}
