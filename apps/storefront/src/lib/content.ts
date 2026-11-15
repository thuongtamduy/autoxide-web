import "server-only";

import { cache } from "react";
import type { Locale } from "@/i18n/routing";
import { loadOptional, loadPublic } from "./core";

// Đọc nội dung công khai của module `content` (bài viết, trang, danh mục, tác giả, tìm kiếm).
// `cache` của React: trong một request, cùng câu hỏi chỉ gọi core một lần (vd `generateMetadata`
// và trang cùng đọc một bài).

/** Số bài một trang của danh sách: chia hết cho 3 và 2 (lưới 3 cột, 2 cột) — không thẻ lẻ. */
export const POSTS_PER_PAGE = 12;

export interface PostQuery {
  termId?: string;
  authorId?: string;
  cursor?: string;
  limit?: number;
}

/** Một trang bài viết đã đăng (mới nhất trước). */
export const listPosts = cache(async (locale: Locale, query: PostQuery = {}) =>
  loadPublic(locale, (client) =>
    client.GET("/api/v1/content/public/posts", {
      params: {
        query: {
          locale,
          limit: query.limit ?? POSTS_PER_PAGE,
          ...(query.termId ? { term_id: query.termId } : {}),
          ...(query.authorId ? { author_id: query.authorId } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
        },
      },
    }),
  ),
);

/** Như `listPosts` nhưng hỏng thì `null` (cho khối phụ, vd "Góc bếp" ở trang chủ). */
export const latestPosts = cache(async (locale: Locale, limit: number) =>
  loadOptional(locale, (client) =>
    client.GET("/api/v1/content/public/posts", { params: { query: { locale, limit } } }),
  ),
);

/** Cái gì nằm ở một địa chỉ: bài / trang để hiện, chuyển hướng, hay đã gỡ hẳn. */
export const resolvePath = cache(async (locale: Locale, path: string) =>
  loadPublic(locale, (client) =>
    client.GET("/api/v1/content/public/resolve", { params: { query: { locale, path } } }),
  ),
);

/** Hai loại phân loại của `content`. */
export const TAXONOMIES = ["category", "tag"] as const;
export type Taxonomy = (typeof TAXONOMIES)[number];

export function isTaxonomy(value: string): value is Taxonomy {
  return (TAXONOMIES as readonly string[]).includes(value);
}

export const getTerm = cache(async (locale: Locale, taxonomy: Taxonomy, slug: string) =>
  loadPublic(locale, (client) =>
    client.GET("/api/v1/content/public/terms/{taxonomy}/{slug}", {
      params: { path: { taxonomy, slug }, query: { locale } },
    }),
  ),
);

export const getAuthor = cache(async (locale: Locale, slug: string) =>
  loadPublic(locale, (client) =>
    client.GET("/api/v1/content/public/authors/{slug}", { params: { path: { slug } } }),
  ),
);

/** Một kết quả tìm kiếm để hiện (bài hay trang). */
export interface ContentHit {
  id: string;
  kind: "post" | "page";
  title: string;
  path: string;
  snippet: string;
}

/**
 * Tìm bài và trang: `GET /api/v1/content/public/search` (theo nghĩa và theo chữ). Core tắt tìm theo
 * nghĩa cho khách (404 `content.semantic_search_disabled`, `AUTOXIDE_CONTENT_PUBLIC_SEMANTIC_SEARCH`)
 * thì tìm theo chữ trong bài viết (`GET /api/v1/content/public/posts?q=`), như core gợi ý.
 */
export const searchContent = cache(async (locale: Locale, q: string): Promise<ContentHit[]> => {
  const found = await loadPublic(locale, (client) =>
    client.GET("/api/v1/content/public/search", { params: { query: { q, locale, limit: 20 } } }),
  );
  if (found) {
    return found.data.flatMap((hit) =>
      hit.path
        ? [
            {
              id: hit.entry_id,
              kind: hit.kind,
              title: hit.title,
              path: hit.path,
              snippet: hit.snippet,
            },
          ]
        : [],
    );
  }
  const posts = await loadPublic(locale, (client) =>
    client.GET("/api/v1/content/public/posts", { params: { query: { locale, q, limit: 20 } } }),
  );
  return (posts?.data ?? []).map((post) => ({
    id: post.id,
    kind: post.kind,
    title: post.title,
    path: post.path,
    snippet: post.excerpt,
  }));
});

export const getPreview = cache(async (locale: Locale, token: string) =>
  loadPublic(locale, (client) =>
    client.GET("/api/v1/content/public/preview", { params: { query: { token } } }),
  ),
);
