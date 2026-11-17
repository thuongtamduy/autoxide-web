import "server-only";

import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { sampleDataEnabled, text } from "@/sample";
import { SITE } from "@/sample/site";
import { loadChrome } from "./core";
import { siteNameSetting } from "./env";

// Tên website và tên mục bài viết. Tên lấy theo thứ tự:
// 1. hồ sơ công khai của nút gốc (cả khách) trong `GET /organizations/public/stores` (bước 34 của
//    core, D-315) — mỗi cửa hàng (khách) một tên, theo tên miền người đọc mở;
// 2. `AUTOXIDE_STOREFRONT_NAME` (core chưa cài `organizations`, hay khách chưa bật "Công khai" cho gốc);
// 3. tên của khách mẫu ("Bếp Mộc") khi bật dữ liệu mẫu, không thì tên chung trong `messages/`.
// Tên mục bài viết: mẫu hoặc chữ chung (core chưa có).

/** Tên hiển thị trong hồ sơ công khai của nút gốc; `null` khi không có hay core không trả được. */
const shopName = cache(async (locale: string): Promise<string | null> => {
  const stores = await loadChrome(locale, (client) =>
    client.GET("/api/v1/organizations/public/stores"),
  );
  const root = stores?.data.find((store) => store.unit_type === "tenant");
  return root?.display_name.trim() || null;
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
