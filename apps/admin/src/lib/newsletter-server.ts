import "server-only";

import { cache } from "react";
import { optional } from "./content-server";
import { load } from "./core";
import type { NewsletterSettings } from "./newsletter";

// Đọc dữ liệu của màn Bản tin cho Server Component.

/**
 * Cấu hình gửi thư người vận hành đặt (`GET /newsletter/settings`, chỉ đọc): nhãn và giới hạn thư
 * quảng cáo, tốc độ gửi, biến môi trường còn thiếu. Gộp trong một request (`cache`); `null` khi core
 * không trả (core cũ, thiếu quyền) — nơi gọi dùng giá trị mặc định của core.
 */
export const loadNewsletterSettings = cache(async (): Promise<NewsletterSettings | null> => {
  const answer = await optional(load((client) => client.GET("/api/v1/newsletter/settings")));
  return answer?.data ?? null;
});
