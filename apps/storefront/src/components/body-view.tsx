import type { ReactNode } from "react";
import { type Locale, localePath } from "@/i18n/routing";
import { isInternalPath, isSafeHref } from "@/lib/body";
import type { BodyMark, BodyNode, PublicMedia } from "@/lib/types";
import { MediaImage } from "./media-image";

// Hiện thân bài (JSON của core) thành React. Core không lưu HTML; mỗi node của danh sách cho phép
// thành đúng một thẻ, node lạ bị bỏ, link không an toàn thành chữ thường (như trang xem trước của
// trang quản trị, `apps/admin/src/components/content/body-view.tsx`). Khác bên đó: ảnh lấy địa chỉ
// và bản thu nhỏ từ `body_media` của bài công khai; link trong site thêm tiền tố ngôn ngữ; tiêu đề
// cấp 2 có `id` (mỏ neo của mục lục, gắn sẵn bởi `outline()`).

interface Context {
  locale: Locale;
  media: Map<string, PublicMedia>;
}

function marked(text: string, marks: readonly BodyMark[], key: string, ctx: Context): ReactNode {
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
          const internal = isInternalPath(href);
          node = (
            <a
              key={k}
              href={internal ? localePath(ctx.locale, href) : href}
              rel={internal ? undefined : "noopener noreferrer nofollow"}
            >
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

function children(node: BodyNode, key: string, ctx: Context): ReactNode[] {
  return (node.content ?? []).map((child, index) => render(child, `${key}.${index}`, ctx));
}

function render(node: BodyNode, key: string, ctx: Context): ReactNode {
  const kids = () => children(node, key, ctx);
  const attrs = node.attrs ?? {};
  switch (node.type) {
    case "text":
      return marked(node.text ?? "", node.marks ?? [], key, ctx);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      return <p key={key}>{kids()}</p>;
    case "heading": {
      const level = attrs.level === 3 ? 3 : attrs.level === 4 ? 4 : 2;
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      const id = typeof attrs.anchor === "string" ? attrs.anchor : undefined;
      return (
        <Tag key={key} id={id} className={level === 2 ? "dsp" : undefined}>
          {kids()}
        </Tag>
      );
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
        <div key={key} className="prose-table">
          <table>
            <tbody>{kids()}</tbody>
          </table>
        </div>
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
      const id = typeof attrs.mediaId === "string" ? attrs.mediaId : "";
      const media = ctx.media.get(id);
      const alt = typeof attrs.alt === "string" ? attrs.alt : (media?.alt ?? "");
      const caption = typeof attrs.caption === "string" && attrs.caption ? attrs.caption : null;
      // Ảnh không còn công khai bị core bỏ khỏi `body_media`: không hiện gì thay vì ảnh vỡ.
      if (!media)
        return caption ? (
          <p key={key} className="prose-cap">
            {caption}
          </p>
        ) : null;
      return (
        <figure key={key}>
          <MediaImage media={media} alt={alt} sizes="(min-width: 800px) 720px, 100vw" />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      );
    }
    case "embed": {
      const url =
        typeof attrs.url === "string" && attrs.url.startsWith("https://") ? attrs.url : "";
      return url ? (
        <p key={key} className="prose-embed">
          <a href={url} rel="noopener noreferrer nofollow">
            {url}
          </a>
        </p>
      ) : null;
    }
    default:
      return null;
  }
}

export function BodyView({
  body,
  media = [],
  locale,
}: {
  body: BodyNode;
  media?: readonly PublicMedia[];
  locale: Locale;
}) {
  const ctx: Context = { locale, media: new Map(media.map((m) => [m.id, m])) };
  return <div className="prose">{children(body, "b", ctx)}</div>;
}
