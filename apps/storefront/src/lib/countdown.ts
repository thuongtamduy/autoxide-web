// Đếm ngược của chương trình có giờ bắt đầu và kết thúc (flash sale, livestream). Hàm thuần, chạy
// được ở máy chủ (lần dựng đầu) và trình duyệt (mỗi giây). Giờ luôn so với "bây giờ" truyền vào —
// không bao giờ so với giờ cố định trong ngày (lỗi cũ: giờ mẫu "20:00 tối nay" hỏng sau 22:00).

export type Phase = "upcoming" | "running" | "ended";

export interface Countdown {
  phase: Phase;
  /** Mili giây tới mốc kế tiếp (bắt đầu khi `upcoming`, kết thúc khi `running`); 0 khi `ended`. */
  remaining: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function countdown(now: number, start: number, end: number): Countdown {
  const phase: Phase = now < start ? "upcoming" : now < end ? "running" : "ended";
  const remaining = phase === "upcoming" ? start - now : phase === "running" ? end - now : 0;
  const total = Math.floor(remaining / 1000);
  return {
    phase,
    remaining,
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Hai chữ số ("07"). */
export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 00:00 hôm nay theo giờ Việt Nam (UTC+7, không có giờ mùa hè), dạng mili giây UTC. */
export function vietnamMidnight(now: number): number {
  const offset = 7 * 3_600_000;
  return Math.floor((now + offset) / 86_400_000) * 86_400_000 - offset;
}

/** "20:00" theo giờ Việt Nam. */
export function vietnamTime(at: number): string {
  const date = new Date(at + 7 * 3_600_000);
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}
