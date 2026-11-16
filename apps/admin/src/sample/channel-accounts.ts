// Tài khoản kênh bán và liên kết sản phẩm mẫu dùng chung (W-006, W-019). Module `channels` của core chưa
// có (bước 48). Hai phân hệ cần cùng một bộ số:
// - màn Đơn hàng (`sample/orders.ts`): đơn nhập từ kênh mang `channel` = loại kênh, tài khoản kênh và
//   mã đơn trên kênh; giá dòng là giá kênh (đã gồm thuế) theo liên kết ở đây;
// - màn Kênh bán (`sample/channels.ts`): tài khoản, liên kết, phân bổ, đơn từ kênh, đối soát.
// File này chỉ có dữ liệu cố định và hàm thuần (không có kho trong bộ nhớ), để `orders.ts` dùng được
// mà không phụ thuộc vòng vào `channels.ts`. Mã shop, khoá kết nối không bao giờ nằm ở đây.
import { ORG } from "./catalog";

/** Loại kênh đã có bộ nối (bộ nối thật là module riêng, D-191 của core); còn lại là "chưa có bộ nối". */
export const CHANNEL_KINDS = ["shopee", "tiktok_shop", "lazada", "facebook", "zalo"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
/** Bộ nối đã cài trên máy chủ mẫu (`GET /channels/connectors`). */
export const INSTALLED_KINDS: readonly ChannelKind[] = ["shopee", "tiktok_shop"];

/** Loại kênh có đơn nhập vào màn Đơn hàng (cột "Kênh"). */
export const EXTERNAL_ORDER_CHANNELS = ["shopee", "tiktok_shop"] as const;
export type ExternalOrderChannel = (typeof EXTERNAL_ORDER_CHANNELS)[number];

export type AccountStatus =
  | "active"
  | "paused"
  | "reauth_required"
  | "unavailable"
  | "disconnected";

export interface AccountSeed {
  id: string;
  kind: ChannelKind;
  name: string;
  /** Cửa hàng sở hữu tài khoản (nút của cây tổ chức mẫu). */
  org_id: string;
  /** Kho lấy tồn để đẩy lên kênh. */
  warehouse_org_ids: string[];
  status: AccountStatus;
  /** Giờ (so với lúc khởi động) tài khoản chuyển trạng thái hiện tại; đơn sau mốc này không về. */
  since_hours: number;
}

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

export const ACCOUNT_ID = {
  official: uid("b2", 1),
  tiktokQ3: uid("b2", 2),
  hanoi: uid("b2", 3),
  lazada: uid("b2", 4),
  fanpage: uid("b2", 5),
} as const;

export const ACCOUNT_SEEDS: readonly AccountSeed[] = [
  {
    id: ACCOUNT_ID.official,
    kind: "shopee",
    name: "Bếp Mộc Official",
    org_id: ORG.TD,
    warehouse_org_ids: [ORG.WH],
    status: "active",
    since_hours: 0,
  },
  {
    id: ACCOUNT_ID.tiktokQ3,
    kind: "tiktok_shop",
    name: "Bếp Mộc Quận 3",
    org_id: ORG.Q3,
    warehouse_org_ids: [ORG.WH],
    status: "reauth_required",
    since_hours: 8,
  },
  {
    id: ACCOUNT_ID.hanoi,
    kind: "shopee",
    name: "Bếp Mộc Hà Nội",
    org_id: ORG.CG,
    warehouse_org_ids: [ORG.CG],
    status: "paused",
    since_hours: 4 * 24 + 20,
  },
  {
    id: ACCOUNT_ID.lazada,
    kind: "lazada",
    name: "Bếp Mộc Mall",
    org_id: ORG.ROOT,
    warehouse_org_ids: [ORG.WH],
    status: "unavailable",
    since_hours: 0,
  },
  {
    id: ACCOUNT_ID.fanpage,
    kind: "facebook",
    name: "Fanpage Bếp Mộc",
    org_id: ORG.ROOT,
    warehouse_org_ids: [ORG.WH],
    status: "unavailable",
    since_hours: 0,
  },
];

/**
 * Giá trên kênh (`price_rule` của đặc tả 48): theo bảng giá của cửa hàng, tăng / giảm theo phần vạn trên
 * giá đó rồi làm tròn lên bậc, hoặc giá cố định có ngày hiệu lực. Giá kênh đã gồm thuế.
 */
export type PriceRule =
  | { kind: "price_list" }
  | { kind: "markup"; markup_bp: number; rounding_minor: number }
  | { kind: "fixed"; amount: number; effective_from: string };

export type ListingStatus = "draft" | "pending" | "live" | "rejected" | "delisted" | "error";

export interface ListingSeed {
  account_id: string;
  sku: string;
  external_sku: string;
  status: ListingStatus;
  price_rule: PriceRule;
  /** Mã lỗi kênh trả khi đăng (đặc tả: `last_error`). */
  last_error?: string;
}

const MARKUP_8: PriceRule = { kind: "markup", markup_bp: 800, rounding_minor: 1000 };
const LIST: PriceRule = { kind: "price_list" };

const live = (
  account_id: string,
  sku: string,
  external_sku: string,
  price_rule: PriceRule = LIST,
): ListingSeed => ({
  account_id,
  sku,
  external_sku,
  status: "live",
  price_rule,
});

export const LISTING_SEEDS: readonly ListingSeed[] = [
  live(ACCOUNT_ID.official, "CG26", "CG26-SHP", MARKUP_8),
  live(ACCOUNT_ID.official, "CG24", "CG24-SHP", MARKUP_8),
  live(ACCOUNT_ID.official, "NI20", "NI20-SHP", MARKUP_8),
  live(ACCOUNT_ID.official, "DB3", "DB3-SHP"),
  live(ACCOUNT_ID.official, "HT1L", "HT1L-SHP"),
  live(ACCOUNT_ID.official, "KB4-XA", "KB4-XA"),
  live(ACCOUNT_ID.official, "NRC750", "NRC750-SHP"),
  live(ACCOUNT_ID.official, "MT200", "MT200-SHP"),
  live(ACCOUNT_ID.official, "TG25", "TG25-SHP"),
  live(ACCOUNT_ID.official, "TGT30", "TGT30-SHP"),
  {
    account_id: ACCOUNT_ID.official,
    sku: "BG6",
    external_sku: "BG6-SHP",
    status: "error",
    price_rule: LIST,
    last_error: "channels.listing_rejected",
  },
  {
    account_id: ACCOUNT_ID.official,
    sku: "TG35",
    external_sku: "TG35-SHP",
    status: "draft",
    price_rule: MARKUP_8,
  },
  live(ACCOUNT_ID.tiktokQ3, "DB3", "BD3-TTS", {
    kind: "fixed",
    amount: 799_000,
    effective_from: "2026-11-01",
  }),
  live(ACCOUNT_ID.tiktokQ3, "NI20", "NI20-TTS"),
  live(ACCOUNT_ID.tiktokQ3, "CG26", "CG26-TTS"),
  live(ACCOUNT_ID.tiktokQ3, "CG24", "CG24-TTS"),
  live(ACCOUNT_ID.tiktokQ3, "HT1L", "HT1L-TTS"),
  live(ACCOUNT_ID.tiktokQ3, "NRC750", "NRC750-TTS"),
  live(ACCOUNT_ID.tiktokQ3, "KB4-XA", "KB4-XA-TTS"),
  live(ACCOUNT_ID.hanoi, "CG26", "CG26-HN"),
  live(ACCOUNT_ID.hanoi, "NI20", "NI20-HN"),
  live(ACCOUNT_ID.hanoi, "TG35", "TG35-HN"),
  live(ACCOUNT_ID.hanoi, "KB4-XA", "KB4-XA-HN"),
  live(ACCOUNT_ID.hanoi, "HT1L", "HT1L-HN"),
  live(ACCOUNT_ID.hanoi, "DB3", "DB3-HN"),
];

/** Giá kênh từ giá bảng giá của cửa hàng (`web`, đồng, gồm thuế) theo quy tắc, lúc `day` (YYYY-MM-DD). */
export function channelPrice(rule: PriceRule, web: number, day: string): number {
  switch (rule.kind) {
    case "price_list":
      return web;
    case "markup": {
      const raw = (web * (10_000 + rule.markup_bp)) / 10_000;
      return Math.ceil(raw / rule.rounding_minor) * rule.rounding_minor;
    }
    case "fixed":
      return day >= rule.effective_from ? rule.amount : web;
  }
}

/** Liên kết đang bán của một SKU trên một tài khoản (`null` khi chưa gắn hay chưa bán). */
export function liveListing(accountId: string, sku: string): ListingSeed | null {
  return (
    LISTING_SEEDS.find((l) => l.account_id === accountId && l.sku === sku && l.status === "live") ??
    null
  );
}

/** Tài khoản theo cửa hàng sở hữu, cho đơn sinh (một cửa hàng một tài khoản có đơn). */
export function accountForStore(orgId: string): AccountSeed | null {
  return (
    ACCOUNT_SEEDS.find(
      (a) => a.org_id === orgId && (a.kind === "shopee" || a.kind === "tiktok_shop"),
    ) ?? null
  );
}

/** Mã đơn trên kênh của một số đơn (Shopee: `SP-…`, TikTok Shop: `TT-…`). */
export function externalRef(kind: ChannelKind, seq: number, placedDay: string): string {
  const day = placedDay.replaceAll("-", "").slice(2);
  return kind === "tiktok_shop"
    ? `TT-5781${String(seq).padStart(4, "0")}`
    : `SP-${day}${String(seq).padStart(4, "0")}`;
}

/**
 * Đơn sinh nào là đơn nhập từ kênh: một phần đơn web của ba cửa hàng có tài khoản kênh (số đơn chia 3
 * dư 1), chỉ khi mọi dòng có liên kết đang bán và tài khoản đang chạy lúc đặt. Hàm thuần, không dùng bộ
 * sinh số ngẫu nhiên (đổi ở đây không làm đổi các đơn sinh khác).
 */
export function channelForGenerated(
  seq: number,
  orgId: string,
  placedAt: number,
  skus: readonly string[],
  now: number = Date.now(),
): AccountSeed | null {
  if (seq % 3 !== 1) return null;
  const account = accountForStore(orgId);
  if (!account) return null;
  if (account.status !== "active" && placedAt > now - account.since_hours * 3_600_000) return null;
  if (!skus.every((sku) => liveListing(account.id, sku) !== null)) return null;
  return account;
}
