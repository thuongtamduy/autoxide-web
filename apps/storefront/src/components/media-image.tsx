import type { PublicMedia } from "@/lib/types";

/**
 * Ảnh công khai của core: `srcset` từ các bản thu nhỏ, WebP khi có (`<picture>`). Địa chỉ ảnh của
 * core là đường dẫn `/api/v1/media/…`, website chuyển tiếp nó tới core
 * (`app/api/v1/media/[id]/content/route.ts`), nên trình duyệt không gọi core trực tiếp.
 */
export function MediaImage({
  media,
  alt,
  sizes = "100vw",
  className,
  priority = false,
}: {
  media: PublicMedia;
  alt?: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  const jpeg = media.variants.map((v) => `${v.url} ${v.width}w`).join(", ");
  const webp = media.variants.every((v) => v.webp_url)
    ? media.variants.map((v) => `${v.webp_url} ${v.width}w`).join(", ")
    : "";
  return (
    <picture>
      {webp ? <source type="image/webp" srcSet={webp} sizes={sizes} /> : null}
      <img
        className={className}
        src={media.url}
        srcSet={jpeg || undefined}
        sizes={jpeg ? sizes : undefined}
        alt={alt ?? media.alt}
        width={media.width ?? undefined}
        height={media.height ?? undefined}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    </picture>
  );
}
