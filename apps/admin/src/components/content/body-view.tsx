import type { ReactNode } from "react";
import { type BodyMark, type BodyNode, isSafeHref } from "@/lib/content";
import { isUuid, mediaIdSrc, type PublicMedia, publicMediaSrc } from "@/lib/media";

// Hiện thân bài (JSON của core) thành React, cho trang xem trước. Core không lưu HTML; ở đây
// mỗi node của danh sách cho phép thành đúng một thẻ, node lạ bị bỏ, link không an toàn thành
// chữ thường. Bản xem trước của core trả kèm ảnh công khai của thân bài (`body_media`: địa chỉ có
// phiên bản, kích thước, bản nhỏ); ảnh không có trong đó (riêng tư, đã xoá) hiện thành ô giữ chỗ —
// core không đưa tệp riêng tư ra qua link xem trước. Ảnh tải qua route `/media/{id}/content` của
// giao diện. Không có `media` (nơi gọi khác) thì tải theo id như trước.

/** Ảnh của thân bài theo id, và câu cho ô giữ chỗ của ảnh không xem được. */
interface MediaContext {
  byId: ReadonlyMap<string, PublicMedia>;
  missing: string;
}

function marked(text: string, marks: readonly BodyMark[], key: string): ReactNode {
  let node: ReactNode = text;
  marks.forEach((mark, index) => {
    const k = `${key}-${index}`;
    switch (mark.type) {
      case "bold":
        node = <strong key={k}>{node}</strong>;
        break;
      case "italic":
        node = <em key={k}>{node}</em>;
        break;
      case "underline":
        node = <u key={k}>{node}</u>;
        break;
      case "strike":
        node = <s key={k}>{node}</s>;
        break;
      case "code":
        node = <code key={k}>{node}</code>;
        break;
      case "link": {
        const href = mark.attrs?.href;
        if (typeof href === "string" && isSafeHref(href)) {
          node = (
            <a key={k} href={href} rel="noopener noreferrer nofollow">
              {node}
            </a>
          );
        }
        break;
      }
    }
  });
  return node;
}

function children(node: BodyNode, key: string, media?: MediaContext): ReactNode[] {
  return (node.content ?? []).map((child, index) => render(child, `${key}.${index}`, media));
}

function render(node: BodyNode, key: string, media?: MediaContext): ReactNode {
  const kids = () => children(node, key, media);
  const attrs = node.attrs ?? {};
  switch (node.type) {
    case "text":
      return marked(node.text ?? "", node.marks ?? [], key);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      return <p key={key}>{kids()}</p>;
    case "heading": {
      const level = attrs.level === 3 ? 3 : attrs.level === 4 ? 4 : 2;
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      return <Tag key={key}>{kids()}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{kids()}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={typeof attrs.start === "number" ? attrs.start : undefined}>
          {kids()}
        </ol>
      );
    case "listItem":
      return <li key={key}>{kids()}</li>;
    case "blockquote":
      return <blockquote key={key}>{kids()}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{(node.content ?? []).map((child) => child.text ?? "").join("")}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "table":
      return (
        <table key={key}>
          <tbody>{kids()}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={key}>{kids()}</tr>;
    case "tableHeader":
    case "tableCell": {
      const Tag = node.type === "tableHeader" ? "th" : "td";
      return (
        <Tag
          key={key}
          colSpan={typeof attrs.colspan === "number" ? attrs.colspan : undefined}
          rowSpan={typeof attrs.rowspan === "number" ? attrs.rowspan : undefined}
        >
          {kids()}
        </Tag>
      );
    }
    case "image": {
      const id = typeof attrs.mediaId === "string" && isUuid(attrs.mediaId) ? attrs.mediaId : "";
      const alt = typeof attrs.alt === "string" ? attrs.alt : "";
      return (
        <figure key={key} className="ce-media ce-media-read">
          {id ? <BodyImage id={id} alt={alt} media={media} /> : null}
          {typeof attrs.caption === "string" ? <figcaption>{attrs.caption}</figcaption> : null}
        </figure>
      );
    }
    case "embed": {
      const url =
        typeof attrs.url === "string" && attrs.url.startsWith("https://") ? attrs.url : "";
      return (
        <p key={key} className="ce-embed">
          {url ? (
            <a href={url} rel="noopener noreferrer nofollow">
              {url}
            </a>
          ) : null}
        </p>
      );
    }
    default:
      return null;
  }
}

function BodyImage({
  id,
  alt,
  media,
}: {
  id: string;
  alt: string;
  media: MediaContext | undefined;
}) {
  if (!media) {
    // biome-ignore lint/performance/noImgElement: ảnh đi qua route `/media/…` của giao diện
    return <img src={mediaIdSrc(id)} alt={alt} />;
  }
  const found = media.byId.get(id);
  if (!found) {
    return (
      <span className="ce-media-ph" role="img" aria-label={media.missing}>
        {media.missing}
      </span>
    );
  }
  return <PublicImage media={found} alt={alt} />;
}

/** Ảnh công khai như người đọc tải: địa chỉ có phiên bản, kích thước, bản nhỏ cho `srcset`. */
export function PublicImage({ media, alt }: { media: PublicMedia; alt?: string }) {
  const srcSet = media.variants
    .map((variant) => `${publicMediaSrc(variant.url)} ${variant.width}w`)
    .join(", ");
  return (
    // biome-ignore lint/performance/noImgElement: ảnh đi qua route `/media/…` của giao diện
    <img
      src={publicMediaSrc(media.url)}
      srcSet={srcSet || undefined}
      sizes={srcSet ? "(max-width: 760px) 100vw, 720px" : undefined}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      alt={alt || media.alt}
    />
  );
}

export function BodyView({
  body,
  media,
  missingImage = "",
}: {
  body: BodyNode;
  /** Ảnh công khai của thân bài (`body_media` của bản xem trước). */
  media?: readonly PublicMedia[];
  /** Câu cho ô giữ chỗ của ảnh không xem được (riêng tư, đã xoá). */
  missingImage?: string;
}) {
  const context = media
    ? { byId: new Map(media.map((m) => [m.id, m])), missing: missingImage }
    : undefined;
  return <div className="ce-prose ce-read">{children(body, "b", context)}</div>;
}
