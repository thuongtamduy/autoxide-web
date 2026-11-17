// Phần thuần (không gọi mạng) của phân hệ Sàn: màn "Vận hành sàn" và Trung tâm người bán (module
// `marketplace` của core, bước 46). Dùng được cả ở máy chủ lẫn trình duyệt.

// Permission dự kiến theo đặc tả bước 46 (`Module::permissions`). Core chưa có module này: sổ điều
// hướng và nút trên màn lọc theo các tên này (admin có mọi permission), để khi có API thật thì không
// phải sửa (W-006, W-018).
export const MARKETPLACE_SELL = "marketplace.sell";
export const MARKETPLACE_SELLERS_READ = "marketplace.sellers.read";
export const MARKETPLACE_SELLERS_MANAGE = "marketplace.sellers.manage";
export const MARKETPLACE_LISTINGS_REVIEW = "marketplace.listings.review";
export const MARKETPLACE_FEES_MANAGE = "marketplace.fees.manage";
export const MARKETPLACE_FINANCE_READ = "marketplace.finance.read";
export const MARKETPLACE_FINANCE_MANAGE = "marketplace.finance.manage";
export const MARKETPLACE_DISPUTES_RESOLVE = "marketplace.disputes.resolve";

/** Màn "Vận hành sàn" hiện khi xem được ít nhất một tab. */
export const MARKET_PERMISSIONS = [
  MARKETPLACE_SELLERS_READ,
  MARKETPLACE_LISTINGS_REVIEW,
  MARKETPLACE_FEES_MANAGE,
  MARKETPLACE_FINANCE_READ,
  MARKETPLACE_DISPUTES_RESOLVE,
] as const;

/**
 * Không gian người bán hiện cho người bán thật (`marketplace.sell`) và cho người xem được hồ sơ người
 * bán (`marketplace.sellers.read`) để "Xem như người bán" — lối thử, không cấp quyền gì thêm.
 */
export const SELLER_SPACE_PERMISSIONS = [MARKETPLACE_SELL, MARKETPLACE_SELLERS_READ] as const;

/** Cookie giữ người bán đang "xem như" (không phải secret: chỉ là id nút người bán). */
export const SELLER_PREVIEW_COOKIE = "ax_seller_view";

/** Endpoint còn thiếu của bước 46, ghi vào nhãn "Dữ liệu mẫu" (W-006). */
export const ENDPOINTS_46 =
  "GET/POST /api/v1/marketplace/sellers, /sellers/me, /sellers/me/submit, /sellers/{org_id}/transitions, /documents/{id}/decision, /listing-reviews, /fee-rules, /fee-rules/preview, /settlements, /payouts, /payouts/{id}/retry, /statements, /disputes, /disputes/{id}/transitions, /sellers/{org_id}/performance, /penalties";

/** Phần trăm từ basis point theo ngôn ngữ: 600 → "6%", 550 → "5,5%" (vi) / "5.5%" (en). */
export function percentFromBp(bp: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bp / 100)}%`;
}

/** Điểm đánh giá ×10 thành chữ: 48 → "4,8" (vi) / "4.8" (en). */
export function ratingText(x10: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(x10 / 10);
}

/** Màu nhãn theo trạng thái (lớp của khung: b-ok, b-warn, b-violet…). */
export const SELLER_BADGE: Record<string, string> = {
  draft: "badge b-draft",
  pending_verification: "badge b-warn",
  pending_review: "badge b-violet",
  active: "badge b-ok",
  suspended: "badge b-bad",
  terminated: "badge b-arch",
};

export const LISTING_BADGE: Record<string, string> = {
  pending: "badge b-violet",
  approved: "badge b-ok",
  rejected: "badge b-bad",
  delisted: "badge b-arch",
};

/** Đơn của người bán: "chờ gửi" là việc phải làm nên màu cảnh báo; xong / huỷ thì nhạt. */
export const ORDER_BADGE: Record<string, string> = {
  paid: "badge b-warn",
  shipping: "badge b-info",
  delivered: "badge b-sched",
  completed: "badge b-ok",
  cancelled: "badge b-arch",
};

export const PAYOUT_BADGE: Record<string, string> = {
  building: "badge b-draft",
  sent: "badge b-info",
  paid: "badge b-ok",
  failed: "badge b-bad",
  cancelled: "badge b-arch",
};

export const SETTLEMENT_BADGE: Record<string, string> = {
  pending: "badge b-info",
  held: "badge b-info",
  releasable: "badge b-violet",
  in_payout: "badge b-sched",
  paid: "badge b-ok",
  reversed: "badge b-arch",
};

export const DISPUTE_BADGE: Record<string, string> = {
  open: "badge b-warn",
  seller_responded: "badge b-info",
  escalated: "badge b-violet",
  resolved: "badge b-ok",
  withdrawn: "badge b-arch",
};

export const FEE_BADGE: Record<string, string> = {
  current: "badge b-ok",
  scheduled: "badge b-sched",
  past: "badge b-arch",
};
