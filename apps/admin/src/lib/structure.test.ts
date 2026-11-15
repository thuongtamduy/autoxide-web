import { describe, expect, it } from "vitest";
import type { Entry, Term } from "./content";
import {
  countItems,
  descendants,
  flattenTree,
  pagePath,
  parentChoices,
  termName,
} from "./structure";

function page(id: string, slug: string, parent: string | null, locale = "vi"): Entry {
  return { id, slug, parent_id: parent, locale, title: slug } as Entry;
}

const pages = [
  page("c", "tuyen-dung", "a"),
  page("a", "ve-chung-toi", null),
  page("b", "cua-hang", "a"),
  page("d", "chi-nhanh", "b"),
  page("e", "about-us", null, "en"),
];

describe("cây trang", () => {
  it("cha trước, con ngay sau, theo thứ tự; độ sâu và số con", () => {
    const rows = flattenTree(pages, (x, y) => x.slug.localeCompare(y.slug));
    expect(rows.map((r) => [r.node.id, r.depth, r.children])).toEqual([
      ["e", 0, 0],
      ["a", 0, 2],
      ["b", 1, 1],
      ["d", 2, 0],
      ["c", 1, 0],
    ]);
    expect(rows.find((r) => r.node.id === "d")?.parent?.id).toBe("b");
  });

  it("cha không có trong danh sách, hay vòng lặp: vẫn hiện ở gốc, mỗi nút một lần", () => {
    const loop = [page("x", "x", "y"), page("y", "y", "x"), page("z", "z", "missing")];
    const rows = flattenTree(loop, (a, b) => a.id.localeCompare(b.id));
    expect(rows.map((r) => r.node.id).sort()).toEqual(["x", "y", "z"]);
  });

  it("đường dẫn ghép theo cây", () => {
    expect(pagePath(pages[3] as Entry, pages)).toBe("/ve-chung-toi/cua-hang/chi-nhanh");
    expect(pagePath(pages[1] as Entry, pages)).toBe("/ve-chung-toi");
  });

  it("trang cha mới: cùng ngôn ngữ, không phải chính nó hay con cháu", () => {
    expect([...descendants("a", pages)].sort()).toEqual(["a", "b", "c", "d"]);
    expect(
      parentChoices(pages[2] as Entry, pages)
        .map((p) => p.id)
        .sort(),
    ).toEqual(["a", "c"]);
  });
});

describe("danh mục và menu cũ", () => {
  it("tên theo ngôn ngữ, thiếu thì tên đầu tiên", () => {
    const term = {
      id: "t",
      names: [
        { locale: "vi", name: "Mẹo dùng", slug: "meo-dung" },
        { locale: "en", name: "Tips", slug: "tips" },
      ],
    } as Term;
    expect(termName(term, "en")).toBe("Tips");
    expect(termName(term, "fr")).toBe("Mẹo dùng");
  });

  it("đếm mọi mục kể cả mục con", () => {
    const leaf = { id: "1", label: "a", children: [] };
    expect(countItems([{ ...leaf, children: [leaf, { ...leaf, children: [leaf] }] }, leaf])).toBe(
      5,
    );
  });
});
