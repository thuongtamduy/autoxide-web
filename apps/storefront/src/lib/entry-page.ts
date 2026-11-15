import "server-only";

import { ApiError } from "@autoxide/sdk";
import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { type Locale, localePath } from "@/i18n/routing";
import { resolvePath } from "./content";
import { pageMetadata } from "./seo";
import type { PublicEntry } from "./types";

// Mọi địa chỉ nội dung (bài viết, trang tĩnh) đi qua `GET /api/v1/content/public/resolve`: core
// nói nên hiện bài nào, chuyển hướng đi đâu, hay địa chỉ đã gỡ hẳn. Trang bắt mọi địa chỉ
// (`[...path]`) và trang danh mục lạ dùng chung hàm này.

/** Bài ở `path`, hoặc chuyển hướng / 404 theo lời core. */
export async function entryAt(locale: Locale, path: string): Promise<PublicEntry> {
  let resolution: Awaited<ReturnType<typeof resolvePath>>;
  try {
    resolution = await resolvePath(locale, path);
  } catch (error) {
    // Địa chỉ core không nhận (422: ký tự lạ, quá dài) cũng là "không có trang này".
    if (error instanceof ApiError && error.status === 422) notFound();
    throw error;
  }
  const found = resolution?.data;
  if (!found) notFound();
  if (found.type === "redirect") {
    const target = found.location.startsWith("/")
      ? localePath(locale, found.location)
      : found.location;
    if (found.status === 301 || found.status === 308) permanentRedirect(target);
    redirect(target);
  }
  // Đã gỡ hẳn (410): App Router chưa trả được 410 từ trang, nên trả 404 (xem W-026).
  if (found.type === "gone") notFound();
  return found.entry;
}

/** `metadata` của một bài theo dữ liệu SEO của core. */
export function entryMetadata(entry: PublicEntry, locale: Locale): Metadata {
  const image = entry.seo.og_image ?? entry.featured_media ?? null;
  return pageMetadata({
    locale,
    path: entry.path,
    title: entry.seo.meta_title || entry.title,
    description: entry.seo.meta_description || entry.excerpt,
    alternates: Object.fromEntries(entry.translations.map((tr) => [tr.locale, tr.path])),
    canonical: entry.seo.canonical_url,
    image: image
      ? { url: image.url, alt: image.alt, width: image.width ?? null, height: image.height ?? null }
      : null,
    type: entry.kind === "post" ? "article" : "website",
    publishedTime: entry.first_published_at,
    noindex: entry.seo.noindex,
  });
}

/** Ghép các đoạn của địa chỉ thành đường dẫn (`["blog", "x"]` → `/blog/x`). */
export function joinPath(segments: readonly string[]): string {
  return `/${segments.map((s) => decodeURIComponent(s)).join("/")}`;
}
