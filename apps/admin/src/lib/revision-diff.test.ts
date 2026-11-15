import { describe, expect, it } from "vitest";
import { bodyLines, diffLines, diffSnapshots, trimContext } from "./revision-diff";

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("so hai phiên bản", () => {
  it("thân bài thành dòng theo khối", () => {
    expect(
      bodyLines({
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Cách chọn" }] },
          p("Đáy phẳng"),
          { type: "bulletList", content: [{ type: "listItem", content: [p("Gang")] }] },
          { type: "image", attrs: { mediaId: "m1", alt: "Chảo" } },
          { type: "paragraph", content: [] },
        ],
      }),
    ).toEqual(["### Cách chọn", "Đáy phẳng", "• Gang", "[image m1 · alt: Chảo]"]);
    expect(bodyLines(null)).toEqual([]);
  });

  it("dòng thêm, bớt, giữ nguyên theo thứ tự đọc", () => {
    expect(diffLines(["a", "b", "c"], ["a", "x", "c", "d"])).toEqual([
      { op: "same", text: "a" },
      { op: "remove", text: "b" },
      { op: "add", text: "x" },
      { op: "same", text: "c" },
      { op: "add", text: "d" },
    ]);
  });

  it("ô đã đổi và số dòng thân bài", () => {
    const diff = diffSnapshots(
      { title: "Cũ", slug: "s", noindex: false, body: { type: "doc", content: [p("một")] } },
      {
        title: "Mới",
        slug: "s",
        noindex: true,
        body: { type: "doc", content: [p("một"), p("hai")] },
      },
    );
    expect(diff.fields).toEqual([
      { field: "title", before: "Cũ", after: "Mới" },
      { field: "noindex", before: "false", after: "true" },
    ]);
    expect([diff.added, diff.removed]).toEqual([1, 0]);
  });

  it("gập các dòng giống nhau ở xa chỗ đổi", () => {
    const ops = diffLines(["1", "2", "3", "4", "5", "6", "7"], ["1", "2", "3", "4", "5", "6", "x"]);
    expect(trimContext(ops, 1)).toEqual([
      { op: "gap", count: 5 },
      { op: "same", text: "6" },
      { op: "remove", text: "7" },
      { op: "add", text: "x" },
    ]);
  });
});
