import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { getMe } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { getMySeller, getSeller, type SellerView } from "@/sample/market";
import { MARKETPLACE_SELL, MARKETPLACE_SELLERS_READ, SELLER_PREVIEW_COOKIE } from "./market";
import { can } from "./viewer";

/**
 * Người bán mà Trung tâm người bán đang hiện (W-018).
 * - `own`: người đăng nhập là người bán thật — có `marketplace.sell` ghi rõ trong role (không tính
 *   "mọi permission" của admin), core trả gian hàng của nút mình qua `GET /sellers/me`.
 * - `preview`: "Xem như người bán" của người xem được hồ sơ người bán (`marketplace.sellers.read`):
 *   lối thử tách khỏi quyền thật — không cấp permission nào, chỉ chọn gian hàng để xem; cookie giữ id
 *   nút người bán (không phải secret).
 * `null`: không phải người bán và chưa chọn gian hàng để xem.
 */
export interface SellerContext {
  mode: "own" | "preview";
  seller: SellerView;
}

export const sellerContext = cache(async (): Promise<SellerContext | null> => {
  if (!sampleDataEnabled()) return null;
  const preview = (await cookies()).get(SELLER_PREVIEW_COOKIE)?.value;
  if (preview && (await can(MARKETPLACE_SELLERS_READ))) {
    const found = await getSeller(preview);
    if (found) return { mode: "preview", seller: found.data };
  }
  const me = await getMe();
  if (me.permissions.includes(MARKETPLACE_SELL)) {
    const own = await getMySeller();
    if (own) return { mode: "own", seller: own.data };
  }
  return null;
});
