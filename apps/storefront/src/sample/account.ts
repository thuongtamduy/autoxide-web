// Tài khoản người mua (mẫu, W-030): hồ sơ, hạng và điểm, sổ địa chỉ, đã lưu, đồng ý, văn bản đã chấp
// nhận. Đăng nhập của người mua là bước sau của core, nên trang tài khoản chỉ có tài khoản mẫu: không có
// mật khẩu nào được nhận hay lưu; "đăng nhập" chỉ đặt cookie `sf_buyer` trên trình duyệt này.
//
// Thay bằng (khi core có):
// - đăng nhập người mua bằng OTP / passkey (bước 47 + `auth`), `GET/PUT /api/v1/customers/me`;
// - `GET /api/v1/customers/me/points` (hạng, điểm, lịch sử — bước 47);
// - `GET/POST /api/v1/shipping/me/addresses` (sổ địa chỉ — bước 44);
// - `GET/POST /api/v1/customers/me/wishlist` (đã lưu — bước 47);
// - `/api/v1/compliance/me/consents`, `POST /public/consents/withdraw`, văn bản đã chấp nhận và yêu
//   cầu về dữ liệu cá nhân (xem, tải, xoá — bước 37).
import type { Localized } from "./index";

const L = (vi: string, en: string): Localized => ({ vi, en });

export const BUYER_COOKIE = "sf_buyer";

export interface Buyer {
  /** `sample`: tài khoản mẫu có lịch sử; `new`: tài khoản vừa tạo, chưa có gì. */
  kind: "sample" | "new";
  name: string;
  phone: string;
  /** Tháng tham gia, `YYYY-MM`. */
  since: string;
  tier: "member" | "silver" | "gold";
  points: number;
  /** Chi tiêu 12 tháng (VND) và ngưỡng của hạng kế. */
  spent_12m: number;
  next_tier_at: number | null;
}

export const SAMPLE_BUYER: Buyer = {
  kind: "sample",
  name: "Lan Chi",
  phone: "0901234567",
  since: "2025-03",
  tier: "silver",
  points: 1240,
  spent_12m: 1_240_000,
  next_tier_at: 4_000_000,
};

export function newBuyer(name: string, phone: string, now: Date): Buyer {
  return {
    kind: "new",
    name,
    phone,
    since: now.toISOString().slice(0, 7),
    tier: "member",
    points: 0,
    spent_12m: 0,
    next_tier_at: 2_000_000,
  };
}

/** Giá trị cookie → người mua. Cookie lạ → chưa đăng nhập. */
export function parseBuyer(value: string | undefined, now: Date): Buyer | null {
  if (value === "sample") return SAMPLE_BUYER;
  const match = /^new:(0\d{9}):(.{1,60})$/.exec(value ?? "");
  if (match?.[1] && match[2]) return newBuyer(decodeURIComponent(match[2]), match[1], now);
  return null;
}

export function serializeBuyer(buyer: Pick<Buyer, "kind" | "name" | "phone">): string {
  return buyer.kind === "sample"
    ? "sample"
    : `new:${buyer.phone}:${encodeURIComponent(buyer.name).slice(0, 60)}`;
}

export interface PointsEntry {
  points: number;
  reason: "order" | "referral" | "redeem";
  reference: string;
  /** Số ngày trước hôm nay (âm = sắp tới). */
  days_ago: number;
  status: "pending" | "credited" | "used";
}

/** Lịch sử điểm của tài khoản mẫu: điểm cộng khi đơn hoàn tất (hết hạn đổi trả). */
export const SAMPLE_POINTS: readonly PointsEntry[] = [
  { points: 123, reason: "order", reference: "BM-2611-0420", days_ago: -3, status: "pending" },
  { points: 32, reason: "order", reference: "BM-2610-0388", days_ago: 9, status: "credited" },
  { points: -200, reason: "redeem", reference: "BM-2609-0215", days_ago: 60, status: "used" },
  { points: 200, reason: "referral", reference: "LANCHI50", days_ago: 75, status: "credited" },
];

export interface SavedAddress {
  id: string;
  label: Localized;
  name: string;
  phone: string;
  street: string;
  province: string;
  ward: string;
  /** Tên lưu kèm khi thêm từ danh mục của core; không có thì tra danh sách mẫu theo mã. */
  province_name?: string;
  ward_name?: string;
  default: boolean;
}

export const SAMPLE_ADDRESSES: readonly SavedAddress[] = [
  {
    id: "a1",
    label: L("Nhà", "Home"),
    name: "Lan Chi",
    phone: "0901234567",
    street: "[Số nhà, đường mẫu]",
    province: "79",
    ward: "26743",
    default: true,
  },
  {
    id: "a2",
    label: L("Công ty", "Office"),
    name: "Lan Chi",
    phone: "0901234567",
    street: "[Toà nhà mẫu, tầng 5]",
    province: "79",
    ward: "27139",
    default: false,
  },
];

/** Sản phẩm đã lưu (SKU của `offers.ts`); `notify` = đã đăng ký báo khi có hàng. */
export const SAMPLE_SAVED: readonly { sku: string; notify: boolean }[] = [
  { sku: "CG28", notify: true },
  { sku: "DB3", notify: false },
  { sku: "GS-AMLAM", notify: false },
];

/** Mục đích xử lý dữ liệu cần đồng ý riêng (`compliance_purposes` của bước 37, nhóm `marketing`). */
export interface ConsentItem {
  key: "email" | "sms" | "personalize";
  granted: boolean;
  /** Ngày ghi nhận (số ngày trước hôm nay); `null` = chưa đồng ý. */
  days_ago: number | null;
}

export const SAMPLE_CONSENTS: readonly ConsentItem[] = [
  { key: "email", granted: true, days_ago: 2 },
  { key: "sms", granted: false, days_ago: null },
  { key: "personalize", granted: true, days_ago: 620 },
];

/** Văn bản đã chấp nhận, có phiên bản (`LegalDocuments` của bước 37). */
export const SAMPLE_DOCUMENTS: readonly {
  kind: "terms" | "privacy";
  version: number;
  effective: string;
}[] = [
  { kind: "terms", version: 3, effective: "2026-10-01" },
  { kind: "privacy", version: 2, effective: "2026-01-01" },
];

/** Phần trăm tiến tới hạng kế. */
export function tierProgress(buyer: Buyer): number {
  if (!buyer.next_tier_at) return 100;
  return Math.min(100, Math.round((buyer.spent_12m / buyer.next_tier_at) * 100));
}
