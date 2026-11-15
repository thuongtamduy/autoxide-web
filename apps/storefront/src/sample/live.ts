// Phiên livestream bán hàng (W-029). Thay bằng `GET /api/v1/affiliate/public/live-sessions/{id}`
// (bước 49: phiên + sản phẩm đang gắn; giá hiện lấy lại từ `catalog` lúc đọc) và một danh sách lịch
// phát công khai — đặc tả bước 49 chưa có endpoint danh sách (ghi ở bảng chỗ thiếu API).
//
// Nguồn: `apps/admin/src/sample/affiliate.ts` — cùng ID, tiêu đề, người dẫn, cửa hàng, nền tảng, giờ
// tương đối với "bây giờ" (phiên đang phát bắt đầu 42 phút trước; phiên sắp phát 20:00 ngày kia; phiên
// đã kết thúc dài 100 phút), sản phẩm ghim và giờ ghim. Phiên đã kết thúc: bên trang quản trị lấy giờ
// theo một đơn hàng mẫu, website lấy 19:30 ba ngày trước.
import { vietnamMidnight } from "@/lib/countdown";
import { type Localized, uid } from "./index";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const L = (vi: string, en: string): Localized => ({ vi, en });

export type LivePlatform = "own" | "facebook" | "tiktok" | "youtube";

export interface LiveHost {
  name: string;
  /** `partner`: người tiếp thị liên kết (bước 49); `staff`: nhân viên của cửa hàng. */
  kind: "partner" | "staff";
  /** Đã xác thực danh tính cho việc livestream (KYC, bước 37). */
  verified: boolean;
  phone_verified: boolean;
}

export interface LivePin {
  sku: string;
  /** Giờ ghim, mili giây UTC (luật TMĐT 2025: lưu vết giờ ghim, giá công bố). */
  pinned_at: number;
  /** Mã giảm giá người dẫn nhắc khi giới thiệu. */
  code: string | null;
}

export interface LiveSession {
  id: string;
  title: Localized;
  host: LiveHost;
  /** Cửa hàng bán và giao (mã của `catalog.ts`). */
  store: "q3" | "td" | "cg";
  platform: LivePlatform;
  starts_at: number;
  /** `null`: chưa kết thúc. */
  ends_at: number | null;
  pins: LivePin[];
}

export const LIVE_ID = {
  ended: uid("93", 1),
  live: uid("93", 2),
  scheduled: uid("93", 3),
} as const;

/** Mọi phiên công khai: đang phát, sắp phát, đã kết thúc (giờ tính từ `now`). */
export function liveSessions(now: number): LiveSession[] {
  const t0 = vietnamMidnight(now);
  const liveStart = now - 42 * MINUTE;
  const endedStart = t0 - 3 * DAY + 19 * HOUR + 30 * MINUTE;
  return [
    {
      id: LIVE_ID.live,
      title: L("Mở hộp bộ dao 3 món", "Unboxing the 3-piece knife set"),
      host: { name: "Hằng Bếp Vui", kind: "partner", verified: true, phone_verified: true },
      store: "q3",
      platform: "tiktok",
      starts_at: liveStart,
      ends_at: null,
      pins: [
        { sku: "DB3", pinned_at: liveStart + 4 * MINUTE, code: null },
        { sku: "CG26", pinned_at: liveStart + 22 * MINUTE, code: "BEPMOC10" },
        { sku: "TG35", pinned_at: liveStart + 34 * MINUTE, code: null },
      ],
    },
    {
      id: LIVE_ID.scheduled,
      title: L("Chảo gang cho bếp từ", "Cast iron pans for induction hobs"),
      host: { name: "Bếp Mộc", kind: "staff", verified: true, phone_verified: true },
      store: "q3",
      platform: "facebook",
      starts_at: t0 + 2 * DAY + 20 * HOUR,
      ends_at: null,
      pins: [
        { sku: "CG26", pinned_at: now - 5 * HOUR, code: "BEPMOC10" },
        { sku: "CG28", pinned_at: now - 5 * HOUR, code: "BEPMOC10" },
      ],
    },
    {
      id: LIVE_ID.ended,
      title: L("Bếp Việt với nồi inox", "Vietnamese cooking with a stainless pot"),
      host: { name: "Truyền thông Mộc An", kind: "partner", verified: true, phone_verified: true },
      store: "q3",
      platform: "tiktok",
      starts_at: endedStart,
      ends_at: endedStart + 100 * MINUTE,
      pins: [
        { sku: "NI20", pinned_at: endedStart + 4 * MINUTE, code: null },
        { sku: "CG26", pinned_at: endedStart + 10 * MINUTE, code: null },
      ],
    },
  ];
}

export type LiveStatus = "scheduled" | "live" | "ended";

export function liveStatus(session: LiveSession, now: number): LiveStatus {
  if (session.ends_at !== null && now >= session.ends_at) return "ended";
  return now >= session.starts_at ? "live" : "scheduled";
}

/** Phiên mở mặc định ở `/livestream`: đang phát, không có thì sắp phát gần nhất, rồi mới nhất đã xong. */
export function featuredSession(sessions: readonly LiveSession[], now: number): LiveSession | null {
  const live = sessions.find((s) => liveStatus(s, now) === "live");
  if (live) return live;
  const next = sessions
    .filter((s) => liveStatus(s, now) === "scheduled")
    .sort((a, b) => a.starts_at - b.starts_at)[0];
  if (next) return next;
  return [...sessions].sort((a, b) => b.starts_at - a.starts_at)[0] ?? null;
}
