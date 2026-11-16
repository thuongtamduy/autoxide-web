import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/core";

// `robots.txt`: mọi trang được vào chỉ mục, trừ trang xem trước, trang mở từ link trong thư, tìm
// kiếm và giỏ / đặt hàng / tài khoản (mỗi trang đó cũng tự gắn `noindex`).
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await siteUrl();
  const hidden = [
    "/preview",
    "/newsletter/",
    "/comments/",
    "/search",
    "/gio-hang",
    "/thanh-toan",
    "/tai-khoan",
  ];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...hidden, ...hidden.map((p) => `/en${p}`)] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
