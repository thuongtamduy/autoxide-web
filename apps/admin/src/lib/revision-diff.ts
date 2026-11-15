// So sánh hai phiên bản của một bài (`snapshot` của `GET …/revisions/{revision_id}`): ô nào đổi, và
// thân bài khác nhau ở những khối nào. Thân bài là JSON của trình soạn, nên đổi mỗi khối (đoạn văn,
// tiêu đề, mục danh sách, ảnh…) thành một dòng chữ rồi so từng dòng (LCS). Hàm thuần, dùng cả ở máy
// chủ (màn Lịch sử phiên bản) lẫn trình duyệt (hộp "Xem khác biệt" của trình soạn).
import type { BodyNode } from "./content";

/** Ô so sánh theo thứ tự hiện, tên như trong `snapshot` của core. */
export const DIFF_FIELDS = [
  "title",
  "slug",
  "excerpt",
  "meta_title",
  "meta_description",
  "canonical_url",
  "noindex",
  "featured_media_id",
  "featured_media_alt",
  "og_media_id",
] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];

export interface FieldChange {
  field: DiffField;
  before: string;
  after: string;
}

export type LineOp = { op: "same" | "add" | "remove"; text: string };

export interface RevisionDiff {
  fields: FieldChange[];
  body: LineOp[];
  /** Số dòng thân bài thêm và bớt. */
  added: number;
  removed: number;
}

type Snapshot = Record<string, unknown> | null | undefined;

function show(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function textOf(node: BodyNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return " ";
  return (node.content ?? []).map(textOf).join("");
}

/** Thân bài thành các dòng: mỗi khối một dòng, có tiền tố cho biết loại khối. */
export function bodyLines(body: unknown): string[] {
  const lines: string[] = [];
  const walk = (node: BodyNode, prefix: string) => {
    const attrs = node.attrs ?? {};
    switch (node.type) {
      case "doc":
      case "blockquote":
        for (const child of node.content ?? []) {
          walk(child, node.type === "blockquote" ? `${prefix}> ` : prefix);
        }
        return;
      case "bulletList":
      case "orderedList":
        for (const item of node.content ?? []) {
          for (const child of item.content ?? []) walk(child, `${prefix}• `);
        }
        return;
      case "heading":
        lines.push(`${prefix}${"#".repeat(Number(attrs.level) || 2)} ${textOf(node)}`);
        return;
      case "codeBlock":
        lines.push(`${prefix}\`\`\` ${textOf(node)}`);
        return;
      case "horizontalRule":
        lines.push(`${prefix}———`);
        return;
      case "image":
        lines.push(
          `${prefix}[image ${show(attrs.mediaId)}${attrs.alt ? ` · alt: ${show(attrs.alt)}` : ""}${
            attrs.caption ? ` · ${show(attrs.caption)}` : ""
          }]`,
        );
        return;
      case "embed":
        lines.push(`${prefix}[embed ${show(attrs.url)}]`);
        return;
      case "table":
        for (const row of node.content ?? []) {
          lines.push(`${prefix}| ${(row.content ?? []).map(textOf).join(" | ")} |`);
        }
        return;
      default: {
        const text = textOf(node);
        if (text.trim() !== "") lines.push(`${prefix}${text}`);
      }
    }
  };
  if (body && typeof body === "object") walk(body as BodyNode, "");
  return lines;
}

/** So hai dãy dòng (LCS): dòng giữ nguyên, thêm, bớt theo thứ tự đọc. */
export function diffLines(before: readonly string[], after: readonly string[]): LineOp[] {
  const n = before.length;
  const m = after.length;
  // Bảng LCS (n+1)×(m+1); bài viết thường vài trăm khối nên đủ nhanh.
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = table[i] as number[];
      row[j] =
        before[i] === after[j]
          ? ((table[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((table[i + 1] as number[])[j] as number, row[j + 1] as number);
    }
  }
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ op: "same", text: before[i] as string });
      i++;
      j++;
    } else if (
      ((table[i + 1] as number[])[j] as number) >= ((table[i] as number[])[j + 1] as number)
    ) {
      ops.push({ op: "remove", text: before[i] as string });
      i++;
    } else {
      ops.push({ op: "add", text: after[j] as string });
      j++;
    }
  }
  while (i < n) ops.push({ op: "remove", text: before[i++] as string });
  while (j < m) ops.push({ op: "add", text: after[j++] as string });
  return ops;
}

/** Khác biệt từ phiên bản `before` (cũ hơn) tới `after`. */
export function diffSnapshots(before: Snapshot, after: Snapshot): RevisionDiff {
  const a = before ?? {};
  const b = after ?? {};
  const fields: FieldChange[] = [];
  for (const field of DIFF_FIELDS) {
    const was = show(a[field]);
    const now = show(b[field]);
    if (was !== now) fields.push({ field, before: was, after: now });
  }
  const body = diffLines(bodyLines(a.body), bodyLines(b.body));
  return {
    fields,
    body,
    added: body.filter((line) => line.op === "add").length,
    removed: body.filter((line) => line.op === "remove").length,
  };
}

/** Bỏ bớt các dòng giống nhau ở xa chỗ đổi, giữ `context` dòng quanh mỗi chỗ đổi. */
export function trimContext(
  ops: readonly LineOp[],
  context = 2,
): (LineOp | { op: "gap"; count: number })[] {
  const keep = ops.map(
    (op, index) =>
      op.op !== "same" ||
      ops.slice(Math.max(0, index - context), index + context + 1).some((o) => o.op !== "same"),
  );
  const out: (LineOp | { op: "gap"; count: number })[] = [];
  let gap = 0;
  ops.forEach((op, index) => {
    if (keep[index]) {
      if (gap > 0) out.push({ op: "gap", count: gap });
      gap = 0;
      out.push(op);
    } else {
      gap++;
    }
  });
  if (gap > 0) out.push({ op: "gap", count: gap });
  return out;
}
