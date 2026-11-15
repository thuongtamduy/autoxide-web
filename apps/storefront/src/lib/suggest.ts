// Gợi ý tìm ở đầu trang (W-029, ui-design mục 5: từ khoá, "trong danh mục", sản phẩm có giá, bài viết,
// cửa hàng; gõ không dấu vẫn ra, khớp đúng dấu xếp trước). Hàm thuần: nhận danh sách đã khớp, trả các
// nhóm để hiện. Nguồn: bài viết từ core thật, sản phẩm / danh mục / cửa hàng từ dữ liệu mẫu tới khi
// core có `GET /api/v1/catalog/public/search/suggest` (bước 41) và hồ sơ cửa hàng (bước 34).
import { fold, matchRank } from "./fold";

export interface SuggestItem {
  label: string;
  /** Dòng phụ bên phải: giá, "trong Chảo"… */
  sub: string;
  href: string;
}

export interface SuggestGroup {
  key: "words" | "products" | "posts" | "stores";
  label: string;
  items: SuggestItem[];
}

/** Từ khoá gợi ý: hai chữ đầu của tên sản phẩm khớp (không lặp), tối đa `limit`. */
export function keywordsFrom(names: readonly string[], limit = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const words = name.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
    const key = fold(words);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(words);
    if (out.length >= limit) break;
  }
  return out;
}

/** Danh mục có tên khớp chữ đầu của câu tìm (bỏ dấu), khớp đúng dấu trước. */
export function matchCategory<T extends { name: string }>(
  query: string,
  list: readonly T[],
): T | null {
  const q = fold(query);
  if (!q) return null;
  const first = q.split(" ")[0] ?? q;
  const hits = list.filter((c) => {
    const name = fold(c.name);
    return name.startsWith(first) || q.startsWith(name);
  });
  return [...hits].sort((a, b) => matchRank(a.name, query) - matchRank(b.name, query))[0] ?? null;
}

/** Bỏ nhóm rỗng, giữ thứ tự cố định của bản thiết kế. */
export function compactGroups(groups: SuggestGroup[]): SuggestGroup[] {
  const order: SuggestGroup["key"][] = ["words", "products", "posts", "stores"];
  return groups
    .filter((g) => g.items.length > 0)
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
