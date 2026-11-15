import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import type { PublicEntry } from "@/lib/types";
import { PostCard } from "./post-card";

/**
 * Lưới bài viết có phân trang theo con trỏ của core (`next_cursor`): "Bài cũ hơn" mở trang sau,
 * "Về bài mới nhất" về trang đầu. Không có số trang (core dùng con trỏ, không dùng OFFSET).
 */
export function PostList({
  posts,
  locale,
  basePath,
  nextCursor,
  isFirstPage,
  emptyText,
}: {
  posts: PublicEntry[];
  locale: string;
  basePath: string;
  nextCursor: string | null;
  isFirstPage: boolean;
  emptyText: string;
}) {
  const t = useTranslations("blog");
  if (posts.length === 0) {
    return <p className="empty">{emptyText}</p>;
  }
  return (
    <>
      <div className={`g3 post-grid bl-grid n${Math.min(posts.length, 3)}`}>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} locale={locale} />
        ))}
      </div>
      {nextCursor || !isFirstPage ? (
        <nav className="pager" aria-label={t("page")}>
          {!isFirstPage ? (
            <Link className="btn" href={basePath}>
              {t("newest")}
            </Link>
          ) : null}
          {nextCursor ? (
            <Link className="btn pri" href={`${basePath}?cursor=${encodeURIComponent(nextCursor)}`}>
              {t("older")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

/** Danh mục có trong các bài của trang (core chưa có danh sách danh mục công khai). */
export function TopicChips({ posts, label }: { posts: PublicEntry[]; label: string }) {
  const seen = new Map<string, { name: string; slug: string }>();
  for (const post of posts) {
    for (const term of post.terms) {
      if (term.taxonomy === "category" && !seen.has(term.id)) {
        seen.set(term.id, { name: term.name, slug: term.slug });
      }
    }
  }
  if (seen.size === 0) return null;
  return (
    <nav className="bl-topics" aria-label={label}>
      {[...seen.values()].map((term) => (
        <Link key={term.slug} className="chip" href={routes.term("category", term.slug)}>
          {term.name}
        </Link>
      ))}
    </nav>
  );
}
