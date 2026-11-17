import "server-only";

import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { sampleDataEnabled, text } from "@/sample";
import { SITE } from "@/sample/site";
import { loadChrome } from "./core";
import { siteNameSetting } from "./env";

// Tên website và tên mục bài viết. Tên lấy theo thứ tự:
// 1. hồ sơ của website đang được gọi (`GET /organizations/public/site`, D-331 của core): tên miền gắn
//    với một cửa hàng con thì tên của cửa hàng đó, không thì tên của cả khách (nút gốc);
// 2. `AUTOXIDE_STOREFRONT_NAME` (core chưa cài `organizations`, hay khách chưa bật "Công khai" cho gốc);
// 3. tên của khách mẫu ("Bếp Mộc") khi bật dữ liệu mẫu, không thì tên chung trong `messages/`.
// Tên mục bài viết: mẫu hoặc chữ chung (core chưa có).

/**
 * Tên hiển thị trong hồ sơ của website đang được gọi, khi khách đã bật "Công khai" cho hồ sơ đó (như
 * trước: khách chưa công bố thì dùng tên đặt trong cấu hình); `null` khi không có hay core không trả.
 */
const shopName = cache(async (locale: string): Promise<string | null> => {
  const site = await loadChrome(locale, (client) =>
    client.GET("/api/v1/organizations/public/site"),
  );
  return site?.data.public ? site.data.display_name.trim() || null : null;
});

export interface SiteIdentity {
  name: string;
  blogName: string;
  marketplace: string | null;
}

export async function siteIdentity(locale: string): Promise<SiteIdentity> {
  const t = await getTranslations({ locale, namespace: "site" });
  const sample = sampleDataEnabled();
  const name =
    (await shopName(locale)) || siteNameSetting() || (sample ? SITE.name : t("defaultName"));
  return {
    name,
    blogName: sample ? text(SITE.blogName, locale) : t("blog"),
    marketplace: sample ? text(SITE.marketplace, locale) : null,
  };
}
