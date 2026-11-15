import type { Problem } from "@autoxide/sdk";
import { describe, expect, it } from "vitest";
import { flatten, type MenuItemDraft } from "./menu-tree";
import {
  dayOfUntil,
  fromSaved,
  idAt,
  importPlan,
  type LegacyMenu,
  newItemId,
  parseItemPath,
  previewFromDraft,
  previewFromPublic,
  type RefObject,
  type SiteMenuItem,
  serverIssues,
  toInput,
  untilFromDay,
  vnDate,
  vnMidnight,
} from "./menus";

const saved: SiteMenuItem[] = [
  {
    id: "a",
    label: "Danh mục",
    url: null,
    ref: { kind: "content.term", id: "t1" },
    auto_children: true,
    auto_children_limit: 8,
    icon: "grid",
    highlight: null,
    badge: null,
    feature: { kind: "content.entry", id: "e1" },
    children: [
      {
        id: "a1",
        label: "Khuyến mại",
        url: "/khuyen-mai",
        ref: null,
        auto_children: false,
        auto_children_limit: null,
        icon: "percent",
        highlight: "sale",
        badge: { text: "−10%", tone: "sale", from: "2026-11-01T00:00:00Z", until: null },
        feature: null,
        children: [],
      },
    ],
  },
  {
    id: "b",
    label: "Hỗ trợ",
    url: null,
    ref: null,
    auto_children: false,
    auto_children_limit: null,
    icon: null,
    highlight: null,
    badge: null,
    feature: null,
    children: [],
  },
];

describe("đổi giữa menu của core và bản nháp", () => {
  it("đọc cây đã lưu: giữ đích, nhãn nổi bật; số nhóm con mặc định khi core trả null", () => {
    const draft = fromSaved(saved);
    expect(draft[0]?.ref).toEqual({ kind: "content.term", id: "t1" });
    expect(draft[0]?.auto_children_limit).toBe(8);
    expect(draft[0]?.children[0]?.badge?.tone).toBe("sale");
    expect(draft[1]?.auto_children_limit).toBe(12);
    expect(flatten(draft).map((r) => `${r.id}${r.depth}`)).toEqual(["a0", "a11", "b0"]);
  });

  it("thân PUT đúng SiteMenuItemInput: một đích, giới hạn chỉ khi bật, bỏ trường trống", () => {
    const draft = fromSaved(saved);
    expect(toInput(draft)).toEqual([
      {
        id: "a",
        label: "Danh mục",
        ref: { kind: "content.term", id: "t1" },
        auto_children: true,
        auto_children_limit: 8,
        icon: "grid",
        feature: { kind: "content.entry", id: "e1" },
        children: [
          {
            id: "a1",
            label: "Khuyến mại",
            url: "/khuyen-mai",
            icon: "percent",
            highlight: "sale",
            badge: { text: "−10%", tone: "sale", from: "2026-11-01T00:00:00Z" },
          },
        ],
      },
      { id: "b", label: "Hỗ trợ" },
    ]);
    // Chép sang menu khác: không gửi id (core cấp id mới).
    expect(toInput(draft, { keepIds: false })[1]).toEqual({ label: "Hỗ trợ" });
    // Mục mới thêm (chưa lưu) không gửi id.
    const fresh = { ...(draft[1] as MenuItemDraft), id: newItemId() };
    expect(toInput([fresh])).toEqual([{ label: "Hỗ trợ" }]);
    // Đổi sang đường dẫn: "tự lấy" của đích cũ không gửi; nhãn nổi bật không chữ thì bỏ.
    const changed: MenuItemDraft = {
      ...(draft[0] as MenuItemDraft),
      label: "  ",
      url: " /a ",
      ref: null,
      badge: { text: "", tone: "new", from: null, until: null },
      children: [],
    };
    expect(toInput([changed])).toEqual([
      { id: "a", url: "/a", icon: "grid", feature: { kind: "content.entry", id: "e1" } },
    ]);
  });
});

describe("lỗi 422 của core về đúng mục", () => {
  it("đọc vị trí trong cây", () => {
    expect(parseItemPath("items[0].children[1].ref.id")).toEqual({
      indexes: [0, 1],
      rest: "ref.id",
    });
    expect(parseItemPath("items[2].auto_children")).toEqual({
      indexes: [2],
      rest: "auto_children",
    });
    expect(parseItemPath("items[1].children[0].children[0].children[0].children[0]")).toEqual({
      indexes: [1, 0, 0, 0, 0],
      rest: "",
    });
    expect(parseItemPath("items")).toBeNull();
    expect(parseItemPath("key")).toBeNull();
  });

  it("gom errors[] theo id của mục đã gửi", () => {
    const rows = flatten(fromSaved(saved));
    expect(idAt(fromSaved(saved), [0, 0])).toBe("a1");
    expect(idAt(fromSaved(saved), [5])).toBeNull();
    const problem: Problem = {
      type: "about:blank",
      title: "Unprocessable Entity",
      status: 422,
      code: "validation_failed",
      detail: "The request contains invalid values.",
      errors: [
        { field: "items[0].children[0].url", code: "invalid", detail: "bad url" },
        { field: "items[0].ref.kind", code: "ref_unknown_kind", detail: "no module" },
        { field: "items", code: "length", detail: "at most 200 items" },
      ],
    };
    expect(serverIssues(problem, rows)).toEqual([
      { id: "a1", rest: "url", code: "invalid", detail: "bad url" },
      { id: "a", rest: "ref.kind", code: "ref_unknown_kind", detail: "no module" },
      { id: null, rest: "items", code: "length", detail: "at most 200 items" },
    ]);
  });
});

describe("ngày của nhãn nổi bật theo giờ Việt Nam", () => {
  it("hiện từ 0:00 ngày đầu tới hết ngày cuối", () => {
    expect(vnMidnight("2026-11-20")).toBe("2026-11-19T17:00:00.000Z");
    expect(vnDate("2026-11-19T17:00:00.000Z")).toBe("2026-11-20");
    expect(untilFromDay("2026-11-30")).toBe("2026-11-30T17:00:00.000Z");
    expect(dayOfUntil("2026-11-30T17:00:00.000Z")).toBe("2026-11-30");
  });
});

describe("xem trước mặt tiền", () => {
  const objects = new Map<string, RefObject>([
    [
      "content.term:t1",
      {
        kind: "content.term",
        id: "t1",
        title: "Chọn mua",
        hint: "",
        public: true,
        children: ["Chảo", "Nồi", "Dao"],
        sample: false,
      },
    ],
    [
      "content.entry:e1",
      {
        kind: "content.entry",
        id: "e1",
        title: "Nháp",
        hint: "",
        public: false,
        children: [],
        sample: false,
      },
    ],
  ]);

  it("bản nháp theo luật menu công khai: nhóm rỗng bỏ, nhãn ngoài hạn ẩn, gợi ý chưa công khai bỏ", () => {
    const rows = flatten(fromSaved(saved));
    const items = previewFromDraft(
      rows,
      new Set(),
      objects,
      (row) => row.label,
      "2026-10-01T00:00:00Z",
    );
    expect(items.map((i) => i.label)).toEqual(["Danh mục"]);
    expect(items[0]?.auto).toEqual(["Chảo", "Nồi", "Dao"]);
    expect(items[0]?.feature).toBeNull();
    expect(items[0]?.children[0]?.badge).toBeNull();
    const later = previewFromDraft(
      rows,
      new Set(["a1"]),
      objects,
      (r) => r.label,
      "2026-11-15T00:00:00Z",
    );
    expect(later[0]?.children).toEqual([]);
  });

  it("menu công khai của core", () => {
    const items = previewFromPublic([
      {
        label: "A",
        href: "/a",
        ref: null,
        icon: "star",
        highlight: "accent",
        badge: { text: "Mới", tone: "new" },
        feature: {
          ref: { kind: "content.entry", id: "e" },
          title: "Bài",
          summary: "Tóm tắt",
          href: "/b",
          image: null,
        },
        children: [{ label: "B", href: "/b", children: [] }],
      },
    ]);
    expect(items[0]).toMatchObject({
      key: "p0",
      icon: "star",
      highlight: "accent",
      badge: { text: "Mới", tone: "new" },
      feature: { title: "Bài", summary: "Tóm tắt" },
    });
    expect(items[0]?.children[0]?.key).toBe("p0.0");
  });
});

describe("xem trước lệnh nhập menu cũ", () => {
  it("tạo menu chưa có cùng khoá và ngôn ngữ; có rồi thì giữ", () => {
    const legacy: LegacyMenu[] = [
      {
        id: "m1",
        key: "blog",
        locale: "vi",
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
        items: [
          {
            id: "i1",
            label: "A",
            url: "/a",
            children: [{ id: "i2", label: "B", url: "/b", children: [] }],
          },
        ],
      },
      {
        id: "m2",
        key: "main",
        locale: "vi",
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
        items: [],
      },
    ];
    expect(importPlan(legacy, [{ key: "main", locale: "vi" }])).toEqual([
      { key: "blog", locale: "vi", status: "create", items: 2 },
      { key: "main", locale: "vi", status: "keep", items: 0 },
    ]);
  });
});
