"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

const STYLE: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * Một thời điểm, theo múi giờ của máy người xem. Máy chủ không biết múi giờ đó, nên lần render
 * đầu (ở máy chủ) ghi giờ UTC kèm chữ "UTC"; trình duyệt đổi sang giờ địa phương ngay sau khi tải.
 */
export function Time({ value }: { value: string }) {
  const locale = useLocale();
  const date = new Date(value);
  const [text, setText] = useState(
    () => `${new Intl.DateTimeFormat(locale, { ...STYLE, timeZone: "UTC" }).format(date)} UTC`,
  );
  useEffect(() => {
    setText(new Intl.DateTimeFormat(locale, STYLE).format(new Date(value)));
  }, [locale, value]);
  return <time dateTime={value}>{text}</time>;
}
