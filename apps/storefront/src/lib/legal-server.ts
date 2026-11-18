import "server-only";

import { cache } from "react";
import { sampleDataEnabled } from "@/sample";
import { SAMPLE_OWNER } from "@/sample/legal";
import { loadChrome } from "./core";
import { type BadgeView, badgeView, type OwnerView, ownerView } from "./legal";

// Thông tin pháp lý của website đang được gọi (tên miền chọn khách và cửa hàng, như menu). Core không
// có hồ sơ (404) hay không trả lời: không in gì, trừ khi bật dữ liệu mẫu (hiện hồ sơ mẫu kèm dấu "mẫu"
// để thấy bố cục lúc phát triển). Không bao giờ in chữ giữ chỗ trên bản chạy thật.

export interface LoadedLegal {
  owner: OwnerView | null;
  badge: BadgeView | null;
  /** Hồ sơ là hồ sơ mẫu. */
  sample: boolean;
}

export const loadLegal = cache(async (locale: string): Promise<LoadedLegal> => {
  const [owner, badge] = await Promise.all([
    loadChrome(locale, (client) => client.GET("/api/v1/compliance/public/owner")),
    loadChrome(locale, (client) =>
      client.GET("/api/v1/compliance/public/badge", { params: { query: { locale } } }),
    ),
  ]);
  const view = ownerView(owner?.data ?? null, locale);
  if (view) return { owner: view, badge: badgeView(badge?.data ?? null), sample: false };
  if (sampleDataEnabled()) {
    return { owner: ownerView(SAMPLE_OWNER, locale), badge: null, sample: true };
  }
  return { owner: null, badge: null, sample: false };
});
