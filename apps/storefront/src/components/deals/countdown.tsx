"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { countdown, pad2 } from "@/lib/countdown";

/**
 * Đếm ngược tới giờ bắt đầu, rồi tới giờ kết thúc (flash sale, livestream). Tính lại mỗi giây từ
 * đồng hồ của máy người xem so với giờ tuyệt đối do máy chủ trả — không có giờ cố định trong ngày.
 * Lần dựng đầu dùng `now` của máy chủ để HTML khớp. Trình đọc màn hình đọc nhãn đầy đủ, không đọc
 * từng giây (`aria-live` tắt).
 */
export function Countdown({
  start,
  end,
  now,
  variant = "badge",
}: {
  start: number;
  end: number;
  now: number;
  variant?: "badge" | "boxes";
}) {
  const t = useTranslations("countdown");
  const [at, setAt] = useState(now);
  useEffect(() => {
    setAt(Date.now());
    const timer = window.setInterval(() => setAt(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = countdown(at, start, end);
  if (left.phase === "ended") {
    return <span className="badge b-plain cd-badge">{t("ended")}</span>;
  }
  const parts = { days: left.days, hours: left.hours, minutes: left.minutes };
  const label = t(left.phase === "upcoming" ? "startsIn" : "endsIn", parts);
  if (variant === "boxes") {
    return (
      <span className="cd-boxes" role="timer" aria-label={label}>
        <span className="cd-lab" aria-hidden="true">
          {t(left.phase === "upcoming" ? "startsInShort" : "endsInShort")}
        </span>
        {left.days > 0 ? (
          <span className="cd-box" aria-hidden="true">
            <b className="num">{left.days}</b>
            <i>{t("d")}</i>
          </span>
        ) : null}
        {[
          [left.hours, t("h")],
          [left.minutes, t("m")],
          [left.seconds, t("s")],
        ].map(([value, unit]) => (
          <span className="cd-box" aria-hidden="true" key={String(unit)}>
            <b className="num">{pad2(Number(value))}</b>
            <i>{unit}</i>
          </span>
        ))}
      </span>
    );
  }
  return (
    <span
      className={`badge ${left.phase === "running" ? "b-sale" : "b-brand"} cd-badge`}
      role="timer"
      aria-label={label}
    >
      {label}
    </span>
  );
}
