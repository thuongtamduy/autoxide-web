import { describe, expect, it } from "vitest";
import { isInternalPath, isSafeHref, nodeText, outline, slugify } from "./body";
import type { BodyNode } from "./types";

const heading = (text: string, level = 2): BodyNode => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

describe("link trong thân bài", () => {
  it.each([
    ["https://example.com", true],
    ["mailto:a@example.com", true],
    ["/blog/x", true],
    ["//evil.example", false],
    ["javascript:alert(1)", false],
    ["/a\\b", false],
  ])("%s → %s", (href, ok) => {
    expect(isSafeHref(href)).toBe(ok);
  });

  it("đường dẫn trong site", () => {
    expect(isInternalPath("/blog")).toBe(true);
    expect(isInternalPath("https://x.example")).toBe(false);
  });
});

describe("mục lục", () => {
  it("mỏ neo bỏ dấu, không trùng; chỉ tiêu đề cấp 2", () => {
    const body: BodyNode = {
      type: "doc",
      content: [
        heading("Chảo gang: giữ nhiệt"),
        { type: "paragraph", content: [{ type: "text", text: "Đoạn" }] },
        heading("Chảo gang: giữ nhiệt"),
        heading("Phụ", 3),
        heading("Đồ dùng"),
      ],
    };
    const { body: annotated, toc } = outline(body);
    expect(toc).toEqual([
      { id: "chao-gang-giu-nhiet", text: "Chảo gang: giữ nhiệt" },
      { id: "chao-gang-giu-nhiet-2", text: "Chảo gang: giữ nhiệt" },
      { id: "do-dung", text: "Đồ dùng" },
    ]);
    expect(annotated.content?.[0]?.attrs?.anchor).toBe("chao-gang-giu-nhiet");
    expect(annotated.content?.[3]?.attrs?.anchor).toBeUndefined();
    // Thân bài gốc không bị sửa.
    expect(body.content?.[0]?.attrs?.anchor).toBeUndefined();
  });

  it("chữ thuần và mỏ neo rỗng", () => {
    expect(nodeText(heading("Một hai"))).toBe("Một hai");
    expect(slugify("!!!")).toBe("");
    expect(outline({ type: "doc", content: [heading("!!!")] }).toc[0]?.id).toBe("section");
  });
});
