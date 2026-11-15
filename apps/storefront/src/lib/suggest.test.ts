import { describe, expect, it } from "vitest";
import { compactGroups, keywordsFrom, matchCategory } from "./suggest";

describe("gợi ý tìm", () => {
  it("từ khoá từ hai chữ đầu, không lặp (kể cả khác dấu)", () => {
    expect(
      keywordsFrom(["Chảo gang", "Chảo gang 28 cm", "Thớt gỗ me tây 35 cm", "Thớt gỗ tròn"]),
    ).toEqual(["chảo gang", "thớt gỗ"]);
  });

  it("danh mục khớp chữ đầu, gõ không dấu vẫn ra", () => {
    const cats = [{ name: "Chảo" }, { name: "Nồi" }, { name: "Dao và thớt" }];
    expect(matchCategory("chao gang", cats)?.name).toBe("Chảo");
    expect(matchCategory("Nồi", cats)?.name).toBe("Nồi");
    expect(matchCategory("khăn", cats)).toBeNull();
    expect(matchCategory("", cats)).toBeNull();
  });

  it("bỏ nhóm rỗng, giữ thứ tự", () => {
    const groups = compactGroups([
      { key: "posts", label: "B", items: [{ label: "x", sub: "", href: "/x" }] },
      { key: "stores", label: "C", items: [] },
      { key: "words", label: "A", items: [{ label: "y", sub: "", href: "/y" }] },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["words", "posts"]);
  });
});
