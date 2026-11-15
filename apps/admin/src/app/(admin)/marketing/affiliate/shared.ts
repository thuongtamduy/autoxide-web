import "server-only";

import {
  AFFILIATE_FINANCE,
  AFFILIATE_LIVE_MANAGE,
  AFFILIATE_MANAGE,
  AFFILIATE_PARTNER,
  AFFILIATE_READ,
} from "@/lib/affiliate";
import { allVariants } from "@/sample/catalog";

// Phần dùng chung của màn "Tiếp thị liên kết" (máy chủ).

/** Endpoint còn thiếu của bước 49, ghi vào nhãn "Dữ liệu mẫu" (W-006). */
export const ENDPOINTS_49 =
  "GET /api/v1/affiliate/partners, /partners/{id}, POST /partners/{id}/transitions, GET/PUT /programs/{org_id}, /commission-rules, /commission-rules/{id}/close, /commission-rules/preview, /commissions, /payouts, /payouts/{id}/mark-paid|retry, /live-sessions, /live-sessions/{id}/start|end|products|log|report, /partners/me/stats, /partners/me/links, /partners/me/tax-statement";

/** Permission của từng tab. Góc người tiếp thị là màn của chính người tiếp thị (`affiliate.partner`). */
export const AFFILIATE_TABS = {
  partners: AFFILIATE_READ,
  rules: AFFILIATE_MANAGE,
  commissions: [AFFILIATE_FINANCE, AFFILIATE_READ],
  payouts: AFFILIATE_FINANCE,
  live: [AFFILIATE_LIVE_MANAGE, AFFILIATE_READ],
  portal: [AFFILIATE_PARTNER, AFFILIATE_MANAGE],
} as const;

/** Sản phẩm để chọn (quy tắc theo sản phẩm, xem trước, gắn vào phiên, tạo link). */
export async function productOptions(): Promise<{ value: string; label: string }[]> {
  const { data } = await allVariants();
  return data
    .filter((v) => v.status === "active" && v.variant_active)
    .map((v) => ({
      value: v.sku,
      label: `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""} · ${v.sku}`,
    }));
}
