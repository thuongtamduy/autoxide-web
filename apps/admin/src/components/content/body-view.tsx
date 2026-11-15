import type { ReactNode } from "react";
import { type BodyMark, type BodyNode, isSafeHref } from "@/lib/content";

// Hiện thân bài (JSON của core) thành React, cho trang xem trước. Core không lưu HTML; ở đây
// mỗi node của danh sách cho phép thành đúng một thẻ, node lạ bị bỏ, link không an toàn thành
// chữ thường. Ảnh chỉ có id media (bản xem trước của core không kèm địa chỉ ảnh) nên hiện ô giữ chỗ.

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

function children(node: BodyNode, key: string): ReactNode[] {
  return (node.content ?? []).map((child, index) => render(child, `${key}.${index}`));
}

function render(node: BodyNode, key: string): ReactNode {
  const kids = () => children(node, key);
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
    case "image":
      return (
        <figure key={key} className="ce-media">
          <span className="mono">media {String(attrs.mediaId ?? "")}</span>
          {typeof attrs.alt === "string" ? <span>{attrs.alt}</span> : null}
          {typeof attrs.caption === "string" ? <figcaption>{attrs.caption}</figcaption> : null}
        </figure>
      );
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

export function BodyView({ body }: { body: BodyNode }) {
  return <div className="ce-prose ce-read">{children(body, "b")}</div>;
}
