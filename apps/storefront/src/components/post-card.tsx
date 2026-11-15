import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDate, pick } from "@/lib/format";
import type { PublicEntry } from "@/lib/types";
import { ART_NAMES, Art, TONES } from "./icon";
import { MediaImage } from "./media-image";

/**
 * Thẻ bài viết (trang chủ, danh sách bài, "Đọc tiếp"): ảnh đại diện của bài, không có thì một hình
 * minh hoạ chọn cố định theo id (như bản thiết kế); danh mục đầu tiên làm dòng nhỏ phía trên.
 */
export function PostCard({
  post,
  locale,
  large = false,
}: {
  post: PublicEntry;
  locale: string;
  large?: boolean;
}) {
  const t = useTranslations("blog");
  const category = post.terms.find((term) => term.taxonomy === "category");
  const author = post.authors[0]?.display_name;
  const date = formatDate(post.published_at, locale);
  const meta = [
    author,
    date,
    post.reading_time_minutes > 0 ? t("readingTime", { minutes: post.reading_time_minutes }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link className={`pcard post-card${large ? " post-lg" : ""}`} href={post.path}>
      {post.featured_media ? (
        <span className="thumb post-thumb">
          <MediaImage
            media={post.featured_media}
            sizes={large ? "(min-width: 1024px) 60vw, 100vw" : "(min-width: 1024px) 33vw, 100vw"}
          />
        </span>
      ) : (
        <span className={`thumb post-thumb ${TONES[pick(post.id, TONES.length)]}`}>
          <Art name={ART_NAMES[pick(post.id, ART_NAMES.length)] ?? "pan"} />
        </span>
      )}
      {category ? <span className="kick post-kick">{category.name}</span> : null}
      <span className="dsp post-title">{post.title}</span>
      {large && post.excerpt ? <span className="post-excerpt">{post.excerpt}</span> : null}
      {meta ? <span className="muted post-meta">{meta}</span> : null}
    </Link>
  );
}
