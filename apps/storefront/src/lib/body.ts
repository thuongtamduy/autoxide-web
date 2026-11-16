// Thân bài của core là JSON dạng ProseMirror / Tiptap (`BodyNode`), không phải HTML. Các hàm thuần
// ở đây chuẩn bị thân bài để hiện: kiểm link, gắn mỏ neo cho tiêu đề và lập mục lục. Phần hiện
// thành React ở `components/body-view.tsx`.
//
// `isSafeHref` chép từ `apps/admin/src/lib/content.ts` (không import chéo app): cùng luật với core.
import type { BodyNode } from "./types";

/** Ký tự điều khiển hay `\` (trình duyệt đọc `\` như `/`): core từ chối link có chúng. */
function isUnsafeChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return char === "\\" || code < 0x20 || code === 0x7f;
}

/** Link core nhận: `http(s)://`, `mailto:` hoặc đường dẫn trong site (`/…`, không `//`). */
export function isSafeHref(href: string): boolean {
  const lower = href.trim().toLowerCase();
  if (href.length > 2048 || [...href].some(isUnsafeChar)) return false;
  return (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    (lower.startsWith("/") && !lower.startsWith("//"))
  );
}

/** Đường dẫn trong site (`/…`): cần thêm tiền tố ngôn ngữ khi hiện ở trang tiếng Anh. */
export function isInternalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/** Mỏ neo đọc được từ chữ: bỏ dấu, chữ thường, nối bằng `-` ("Chảo gang: giữ nhiệt" → "chao-gang-giu-nhiet"). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Chữ thuần của một node (gộp mọi node `text` bên trong). */
export function nodeText(node: BodyNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodeText).join("");
}

export interface TocItem {
  id: string;
  text: string;
}

/**
 * Gắn `attrs.anchor` cho mọi tiêu đề cấp 2 (mỏ neo không trùng: thêm `-2`, `-3`…) và lập mục lục
 * theo thứ tự xuất hiện. Không sửa thân bài gốc.
 */
export function outline(body: BodyNode): { body: BodyNode; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const used = new Map<string, number>();
  const walk = (node: BodyNode): BodyNode => {
    if (node.type === "heading" && (node.attrs?.level ?? 2) === 2) {
      const text = nodeText(node).trim();
      const base = slugify(text) || "section";
      const seen = used.get(base) ?? 0;
      used.set(base, seen + 1);
      const id = seen === 0 ? base : `${base}-${seen + 1}`;
      toc.push({ id, text });
      return { ...node, attrs: { ...(node.attrs ?? {}), anchor: id } };
    }
    if (!node.content) return node;
    return { ...node, content: node.content.map(walk) };
  };
  return { body: walk(body), toc };
}
