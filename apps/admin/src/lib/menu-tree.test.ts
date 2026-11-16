import { describe, expect, it } from "vitest";
import {
  addChild,
  badgeShown,
  blankItem,
  type FlatItem,
  flatten,
  indent,
  menuChanges,
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

  it("đường dẫn đúng như service của menus kiểm (is_link; D-149: không nhận //host)", () => {
    expect(urlProblem("/khuyen-mai")).toBeNull();
    expect(urlProblem("/sale?q=1#top")).toBeNull();
    expect(urlProblem("https://cho.example.com")).toBeNull();
    expect(urlProblem("HTTP://example.com")).toBeNull();
    expect(urlProblem("mailto:hotro@example.com")).toBeNull();
    expect(urlProblem("//evil.example.com")).toBe("protocolRelative");
    expect(urlProblem("/\\evil.example.com")).toBe("invalidChar");
    expect(urlProblem("/a b")).toBe("invalidChar");
    expect(urlProblem(`/${"a".repeat(2048)}`)).toBe("tooLong");
    expect(urlProblem("javascript:alert(1)")).toBe("unsupported");
    expect(urlProblem("sale")).toBe("unsupported");
    expect(urlProblem(" ")).toBe("empty");
  });

  it("nhãn nổi bật chỉ hiện trong [from, until)", () => {
    const badge = {
      text: "−10%",
      tone: "sale" as const,
      from: "2026-11-01T00:00:00Z",
      until: "2026-12-01T00:00:00Z",
    };
    expect(badgeShown(badge, "2026-11-15T00:00:00Z")).toBe(true);
    expect(badgeShown(badge, "2026-11-01T00:00:00Z")).toBe(true);
    expect(badgeShown(badge, "2026-12-01T00:00:00Z")).toBe(false);
    expect(badgeShown(badge, "2026-10-31T23:59:59Z")).toBe(false);
    expect(badgeShown({ ...badge, from: null, until: null }, "2030-01-01T00:00:00Z")).toBe(true);
    expect(badgeShown({ ...badge, text: " " }, "2026-11-15T00:00:00Z")).toBe(false);
    expect(badgeShown(null, "2026-11-15T00:00:00Z")).toBe(false);
  });
});

describe("khác biệt giữa hai bản menu", () => {
  const base = rows([
    ["a", 0],
    ["a1", 1],
    ["a2", 1],
    ["b", 0],
  ]);

  it("thêm, sửa, xoá; thêm hay xoá mục khác không làm mục còn lại thành chuyển chỗ", () => {
    const after = rows([
      ["a", 0],
      ["a2", 1],
      ["b", 0],
      ["c", 0],
    ]).map((row) => (row.id === "b" ? { ...row, label: "Bếp", url: "/bep" } : row));
    expect(menuChanges(base, after)).toEqual([
      { kind: "edited", id: "b", fields: ["label", "url"] },
      { kind: "added", id: "c", fields: [] },
      { kind: "removed", id: "a1", fields: [] },
    ]);
  });

  it("đổi cha hay đổi thứ tự giữa anh em là chuyển chỗ", () => {
    const after = rows([
      ["b", 0],
      ["a", 0],
      ["a2", 1],
      ["a1", 2],
    ]);
    expect(menuChanges(base, after).map((c) => `${c.kind}:${c.id}`)).toEqual([
      "moved:b",
      "moved:a",
      "moved:a1",
    ]);
  });

  it("hai bản như nhau thì không có thay đổi", () => {
    expect(menuChanges(base, base)).toEqual([]);
  });
});
