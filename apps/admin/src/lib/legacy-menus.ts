import "server-only";

import { optional } from "./content-server";
import { load } from "./core";
import type { LegacyMenu } from "./structure";

/**
 * Mọi menu cũ của module `content` (`GET /api/v1/content/menus`, sắp ngừng: menu chuyển sang
 * module `menus`), mỗi menu kèm cây mục. Chỉ đọc, làm nguồn cho "nhập menu cũ". `null` khi không
 * đọc được (thiếu `content.read`, chưa cài `content`).
 */
export async function loadLegacyMenus(): Promise<LegacyMenu[] | null> {
  const list = await optional(load((c) => c.GET("/api/v1/content/menus")));
  if (!list) return null;
  const menus = await Promise.all(
    list.data.map((summary) =>
      optional(
        load((c) =>
          c.GET("/api/v1/content/menus/{key}", {
            params: { path: { key: summary.key }, query: { locale: summary.locale } },
          }),
        ),
      ),
    ),
  );
  return menus.flatMap((menu) => (menu ? [menu.data] : []));
}
