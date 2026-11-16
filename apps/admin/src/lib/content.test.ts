import { describe, expect, it } from "vitest";
import {
  abilities,
  type Entry,
  entryErrors,
  entryPath,
  filtersHref,
  hasFilters,
  isEmptyBody,
  isSafeHref,
  listQuery,
  parseFilters,
  postPathPrefix,
  toCoreBody,
  upcomingRows,
} from "./content";

describe("parseFilters / filtersHref / listQuery", () => {
  it("đọc bộ lọc hợp lệ, bỏ giá trị lạ", () => {
    expect(
      parseFilters({ status: "draft", kind: "page", locale: "vi", q: "  bếp ", cursor: "abc" }),
    ).toEqual({ status: "draft", kind: "page", locale: "vi", q: "bếp", cursor: "abc" });
    // Ngôn ngữ nào được mở do core quyết (`AUTOXIDE_CONTENT_LOCALES`): giao diện chỉ bỏ mã sai định dạng.
    expect(
      parseFilters({ status: "trash", kind: "video", locale: "Français", q: "", missing: "x_1" }),
    ).toEqual({
      status: "all",
    });
    expect(parseFilters({ locale: "fr", missing: "pt-BR" })).toEqual({
      status: "all",
      locale: "fr",
      missing: "pt-BR",
    });
    expect(parseFilters({ status: ["published", "draft"] }).status).toBe("published");
  });

  it("đổi bộ lọc thì về trang đầu, đi tiếp thì giữ bộ lọc", () => {
    const filters = parseFilters({ status: "draft", q: "bếp", cursor: "c1" });
    expect(filtersHref(filters, { kind: "post" })).toBe(
      "/content?status=draft&kind=post&q=b%E1%BA%BFp",
    );
    expect(filtersHref(filters, { cursor: "c2" })).toBe(
      "/content?status=draft&q=b%E1%BA%BFp&cursor=c2",
    );
    expect(filtersHref({ status: "all" })).toBe("/content");
    // Website đang chọn (dữ liệu mẫu) đi theo mọi link, không gửi cho core.
    const site = "01a1e000-0000-7000-8000-00000000c502";
    expect(filtersHref(parseFilters({ site }), { status: "draft" })).toBe(
      `/content?status=draft&site=${site}`,
    );
    expect(listQuery(parseFilters({ site }))).not.toHaveProperty("site");
  });

  it("tab chờ duyệt và các chip là tham số lọc của core, không lọc trên trang", () => {
    const term = "01a1dd85-f5c7-77d6-b517-807884ba3e01";
    const filters = parseFilters({
      status: "review",
      mine: "1",
      ai: "1",
      missing: "en",
      term,
      author: "not-a-uuid",
    });
    expect(filters).toEqual({ status: "review", mine: true, ai: true, missing: "en", term });
    expect(listQuery(filters)).toEqual({
      limit: 25,
      sort: "updated_at",
      order: "desc",
      review_requested: true,
      created_by: "me",
      ai_generated: true,
      missing_locale: "en",
      term_id: term,
    });
    expect(filtersHref(filters, { ai: false })).toBe(
      `/content?status=review&mine=1&missing=en&term=${term}`,
    );
    expect(hasFilters({ status: "draft" })).toBe(false);
    expect(hasFilters({ status: "all", mine: true })).toBe(true);
    // "Sắp đăng" không phải trạng thái của bài: không gửi `status`.
    expect(listQuery({ status: "scheduled" })).not.toHaveProperty("status");
  });

  it("Sắp đăng: lịch đang chờ, giờ chạy sớm nhất trước, kèm bài", () => {
    const schedule = (id: string, run_at: string, status = "scheduled") => ({
      id,
      entry_id: `e-${id}`,
      action: "publish" as const,
      run_at,
      status,
      ai_reviewed: false,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    });
    const rows = upcomingRows(
      [
        schedule("a", "2026-12-02T00:00:00Z"),
        schedule("b", "2026-12-01T00:00:00Z"),
        schedule("c", "2026-11-30T00:00:00Z", "canceled"),
      ],
      [{ id: "e-a", title: "A" } as Entry],
    );
    expect(rows.map((r) => [r.schedule.id, r.entry?.title ?? null])).toEqual([
      ["b", null],
      ["a", "A"],
    ]);
  });

  it("đường dẫn của bài và đầu đường dẫn theo cấu hình của core", () => {
    expect(entryPath({ path: "/blog/chao-gang", slug: "chao-gang" })).toBe("/blog/chao-gang");
    expect(entryPath({ path: null, slug: "chao-gang" })).toBe("/chao-gang");
    expect(postPathPrefix("blog")).toBe("/blog/");
    expect(postPathPrefix("/tin-tuc/")).toBe("/tin-tuc/");
    expect(postPathPrefix(undefined)).toBe("/blog/");
    expect(postPathPrefix("")).toBe("/");
  });

  it("tham số cho core: mới sửa lên đầu, chỉ gửi bộ lọc có giá trị", () => {
    expect(listQuery({ status: "all" })).toEqual({ limit: 25, sort: "updated_at", order: "desc" });
    expect(listQuery({ status: "published", locale: "en", cursor: "x" })).toMatchObject({
      status: "published",
      locale: "en",
      cursor: "x",
    });
  });
});

describe("abilities", () => {
  it("theo permission, kể cả bản `_own`", () => {
    expect(abilities({ all_permissions: true, permissions: [] })).toEqual({
      write: true,
      publish: true,
      publishAll: true,
    });
    expect(
      abilities({
        all_permissions: false,
        permissions: ["content.read", "content.write_own", "content.publish_own"],
      }),
    ).toEqual({ write: true, publish: true, publishAll: false });
    expect(abilities({ all_permissions: false, permissions: ["content.read"] })).toEqual({
      write: false,
      publish: false,
      publishAll: false,
    });
  });
});

describe("isSafeHref", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com", true],
    ["mailto:ada@example.com", true],
    ["/blog/x", true],
    ["//evil.example", false],
    ["/\\evil.example", false],
    ["javascript:alert(1)", false],
    ["ftp://example.com", false],
  ])("%s → %s", (href, ok) => {
    expect(isSafeHref(href)).toBe(ok);
  });
});

describe("toCoreBody", () => {
  it("bỏ thuộc tính Tiptap thêm mà core không nhận", () => {
    const body = toCoreBody({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Bếp",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com",
                    target: "_blank",
                    rel: "noopener",
                    class: null,
                  },
                },
                { type: "bold" },
              ],
            },
          ],
        },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Tiêu đề" }] },
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
        {
          type: "codeBlock",
          attrs: { language: null },
          content: [{ type: "text", text: "x", marks: [{ type: "bold" }] }],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(body).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Bếp",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }, { type: "bold" }],
            },
          ],
        },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Tiêu đề" }] },
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
        { type: "codeBlock", content: [{ type: "text", text: "x" }] },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: "paragraph" }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("bỏ link không an toàn (giữ chữ), node lạ và chữ rỗng; giữ ảnh và nhúng", () => {
    const body = toCoreBody({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
            { type: "text", text: "" },
          ],
        },
        { type: "iframe", attrs: { src: "https://evil.example" } },
        {
          type: "image",
          attrs: {
            mediaId: "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e11",
            alt: "",
            caption: null,
            src: "x",
          },
        },
        { type: "embed", attrs: { url: "https://youtube.com/watch?v=1" } },
      ],
    });
    expect(body.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "x" }] },
      { type: "image", attrs: { mediaId: "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e11" } },
      { type: "embed", attrs: { url: "https://youtube.com/watch?v=1" } },
    ]);
    expect(toCoreBody(null)).toEqual({ type: "doc", content: [] });
    // Đoạn trống Tiptap giữ ở cuối không được lưu.
    expect(
      toCoreBody({ type: "doc", content: [{ type: "horizontalRule" }, { type: "paragraph" }] }),
    ).toEqual({ type: "doc", content: [{ type: "horizontalRule" }] });
  });

  it("isEmptyBody", () => {
    expect(isEmptyBody({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
    expect(isEmptyBody({ type: "doc", content: [{ type: "horizontalRule" }] })).toBe(false);
  });
});

describe("entryErrors", () => {
  it("lỗi của ô nằm dưới ô, lỗi của thân bài giữ vị trí", () => {
    const errors = entryErrors({
      type: "about:blank",
      title: "Unprocessable",
      status: 422,
      code: "validation_failed",
      detail: "The request has invalid fields.",
      errors: [
        { field: "title", code: "length", detail: "must be 1 to 300 characters" },
        {
          field: "body.content[0].attrs.href",
          code: "unsafe_link",
          detail: "must start with https://",
        },
      ],
    });
    expect(errors.fields).toEqual({ title: "must be 1 to 300 characters" });
    expect(errors.body).toEqual([
      { field: "body.content[0].attrs.href", detail: "must start with https://" },
    ]);
    expect(errors.message).toBeUndefined();
  });

  it("slug trùng vào ô slug; lỗi khác thành câu báo chung", () => {
    expect(
      entryErrors({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        code: "content.slug_taken",
        detail: "Taken.",
      }).fields,
    ).toEqual({ slug: "Taken." });
    expect(
      entryErrors({
        type: "about:blank",
        title: "x",
        status: 412,
        code: "precondition_failed",
        detail: "Changed.",
      }).message,
    ).toBe("Changed.");
  });
});
