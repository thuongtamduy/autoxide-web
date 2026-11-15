import { describe, expect, it } from "vitest";
import {
  addChild,
  badgeShown,
  blankItem,
  type FlatItem,
  flatten,
  indent,
  moveDown,
  moveUp,
  outdent,
  pathOf,
  removeBlock,
  toTree,
  urlProblem,
} from "./menu-tree";

function rows(spec: [string, number][]): FlatItem[] {
  return spec.map(([id, depth]) => ({ ...blankItem(id, id), depth }));
}
const shape = (list: FlatItem[]) => list.map((r) => `${r.id}${r.depth}`).join(" ");

// a
//   a1
//   a2
// b
// c
const base = rows([
  ["a", 0],
  ["a1", 1],
  ["a2", 1],
  ["b", 0],
  ["c", 0],
]);

describe("cây menu dạng phẳng", () => {
  it("lên, xuống chuyển cả khối và chỉ đổi chỗ với mục cùng cấp", () => {
    const down = moveDown(base, 0);
    expect(down.ok && shape(down.rows)).toBe("b0 a0 a11 a21 c0");
    const up = moveUp(base, 2);
    expect(up.ok && shape(up.rows)).toBe("a0 a21 a11 b0 c0");
    expect(moveUp(base, 1)).toEqual({ ok: false, reason: "edge" });
    expect(moveDown(base, 4)).toEqual({ ok: false, reason: "edge" });
  });

  it("thụt vào thành con cuối của mục phía trên; kéo ra đứng sau khối của cha", () => {
    const inB = indent(base, 4);
    expect(inB.ok && shape(inB.rows)).toBe("a0 a11 a21 b0 c1");
    expect(indent(base, 1)).toEqual({ ok: false, reason: "noSibling" });
    const out = outdent(base, 1);
    expect(out.ok && shape(out.rows)).toBe("a0 a21 a10 b0 c0");
    expect(outdent(base, 0)).toEqual({ ok: false, reason: "edge" });
  });

  it("tối đa 4 cấp", () => {
    const deep = rows([
      ["a", 0],
      ["b", 0],
      ["b1", 1],
      ["b2", 2],
      ["b3", 3],
    ]);
    expect(indent(deep, 1)).toEqual({ ok: false, reason: "depth" });
    expect(addChild(deep, 4, blankItem("x", "x"))).toEqual({ ok: false, reason: "depth" });
    const added = addChild(base, 0, blankItem("x", "x"));
    expect(added.ok && shape(added.rows)).toBe("a0 a11 a21 x1 b0 c0");
  });

  it("bỏ một mục kèm mục con; về cây và trở lại phẳng không đổi", () => {
    expect(shape(removeBlock(base, 0))).toBe("b0 c0");
    expect(shape(flatten(toTree(base)))).toBe(shape(base));
    expect(toTree(base)[0]?.children.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(pathOf(base, 2, (r) => r.label)).toBe("a › a2");
  });

  it("đường dẫn như service sẽ kiểm (D-149: không nhận //host)", () => {
    expect(urlProblem("/khuyen-mai")).toBeNull();
    expect(urlProblem("https://cho.example.com")).toBeNull();
    expect(urlProblem("mailto:hotro@example.com")).toBeNull();
    expect(urlProblem("//evil.example.com")).toBe("protocolRelative");
    expect(urlProblem("http://example.com")).toBe("insecure");
    expect(urlProblem("javascript:alert(1)")).toBe("unsupported");
    expect(urlProblem(" ")).toBe("empty");
  });

  it("nhãn có hạn tự ẩn ngoài khoảng ngày", () => {
    const badge = { badge_text: "−10%", badge_from: "2026-11-01", badge_until: "2026-11-30" };
    expect(badgeShown(badge, "2026-11-15")).toBe(true);
    expect(badgeShown(badge, "2026-12-01")).toBe(false);
    expect(badgeShown(badge, "2026-10-31")).toBe(false);
    expect(badgeShown({ ...badge, badge_text: " " }, "2026-11-15")).toBe(false);
  });
});
