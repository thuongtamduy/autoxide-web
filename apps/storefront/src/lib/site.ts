import "server-only";

import { getTranslations } from "next-intl/server";
import { sampleDataEnabled, text } from "@/sample";
import { SITE } from "@/sample/site";
import { siteNameSetting } from "./env";

// Tên website và tên mục bài viết. Core chưa có hồ sơ công khai của khách (bước 34), nên: tên lấy
// từ `AUTOXIDE_STOREFRONT_NAME`; trống thì dùng tên của khách mẫu ("Bếp Mộc") khi bật dữ liệu mẫu,
// không thì tên chung trong `messages/` ("Autoxide"). Tên mục bài viết theo cùng luật.

export interface SiteIdentity {
  name: string;
  blogName: string;
  marketplace: string | null;
}

export async function siteIdentity(locale: string): Promise<SiteIdentity> {
  const t = await getTranslations({ locale, namespace: "site" });
  const sample = sampleDataEnabled();
  const name = siteNameSetting() || (sample ? SITE.name : t("defaultName"));
  return {
    name,
    blogName: sample ? text(SITE.blogName, locale) : t("blog"),
    marketplace: sample ? text(SITE.marketplace, locale) : null,
  };
}
