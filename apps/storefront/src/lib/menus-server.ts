import "server-only";

import { cache } from "react";
import { sampleDataEnabled } from "@/sample";
import { sampleFooterMenu, sampleMainMenu } from "@/sample/menus";
import { loadChrome } from "./core";
import type { SiteMenu } from "./types";

// Menu của website từ module `menus` của core (`GET /api/v1/menus/public/{key}?locale`). Không có
// menu (404) thì dùng menu mẫu khi bật dữ liệu mẫu, không thì không có menu. Core không trả lời thì
// cũng như không có menu: đầu trang và chân trang không bao giờ làm hỏng trang.

export interface LoadedMenu {
  menu: SiteMenu | null;
  /** Menu là menu mẫu (để hiện dấu "mẫu"). */
  sample: boolean;
}

async function fetchMenu(key: "main" | "footer", locale: string): Promise<SiteMenu | null> {
  const found = await loadChrome(locale, (client) =>
    client.GET("/api/v1/menus/public/{key}", { params: { path: { key }, query: { locale } } }),
  );
  return found?.data ?? null;
}

export const loadMenu = cache(
  async (key: "main" | "footer", locale: string): Promise<LoadedMenu> => {
    const menu = await fetchMenu(key, locale);
    if (menu && menu.items.length > 0) return { menu, sample: false };
    if (sampleDataEnabled()) {
      return {
        menu: key === "main" ? sampleMainMenu(locale) : sampleFooterMenu(locale),
        sample: true,
      };
    }
    return { menu, sample: false };
  },
);
