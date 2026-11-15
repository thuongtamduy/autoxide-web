import { beforeEach, describe, expect, it } from "vitest";
import { flatten } from "@/lib/menu-tree";
import { listWebsites } from "./content";
import {
  createMenu,
  getMenu,
  importLegacy,
  listMenus,
  listRefObjects,
  putMenu,
  resetMenusSample,
  simulateOtherSave,
  validateMenu,
} from "./menus";

beforeEach(resetMenusSample);

async function mainMenu() {
  const site = (await listWebsites()).data[0];
  if (!site) throw new Error("thiếu website mẫu");
  const summary = (await listMenus(site.id)).data.find((m) => m.key === "main");
  if (!summary) throw new Error("thiếu menu main");
  const found = await getMenu(summary.id);
  if (!found.ok) throw new Error("không đọc được menu");
  return { site, ...found.data };
}

describe("menu mẫu (chờ module menus)", () => {
  it("lưu với If-Match: đúng phiên bản thì tăng phiên bản; người khác vừa lưu thì 412", async () => {
    const { menu, etag } = await mainMenu();
    const saved = await putMenu(menu.id, etag, menu.items, "test");
    expect(saved.ok && saved.data.menu.version).toBe(menu.version + 1);
    const stale = await putMenu(menu.id, etag, menu.items, "test");
    expect(stale.ok ? "" : stale.problem.code).toBe("precondition_failed");
    const other = await simulateOtherSave(menu.id);
    expect(other.ok && other.data.version).toBe(menu.version + 2);
  });

  it("gom mọi lỗi của cây một lần, mỗi lỗi chỉ đúng mục", async () => {
    const { menu } = await mainMenu();
    const { data: objects } = await listRefObjects();
    const seller = objects.find((o) => o.kind === "marketplace.seller");
    const [first, ...rest] = menu.items;
    if (!first || !seller) throw new Error("thiếu dữ liệu mẫu");
    const broken = [
      { ...first, url: "//evil.example.com", ref_kind: null, ref_id: null },
      {
        ...first,
        id: "x2",
        ref_kind: "affiliate.live",
        ref_id: "1",
        auto_children: false,
        children: [],
      },
      {
        ...first,
        id: "x3",
        ref_kind: "content.entry",
        ref_id: "gone",
        auto_children: false,
        children: [],
      },
      {
        ...first,
        id: "x4",
        ref_kind: seller.kind,
        ref_id: seller.id,
        auto_children: true,
        children: [],
      },
      ...rest,
    ];
    expect(validateMenu(broken)?.map((e) => [e.field, e.code])).toEqual([
      [`items.${first.id}.url`, "menus.invalid_url"],
      ["items.x2.ref_id", "menus.ref_unknown_kind"],
      ["items.x3.ref_id", "menus.ref_not_found"],
      ["items.x4.auto_children", "menus.children_unsupported"],
    ]);
    const result = await putMenu(menu.id, "*", broken, "test");
    expect(result.ok ? 0 : result.problem.errors?.length).toBe(4);
  });

  it("menu mới: khoá trùng thì báo dưới ô; chép từ menu có sẵn với id mới", async () => {
    const { site, menu } = await mainMenu();
    const taken = await createMenu({ website_id: site.id, key: "main", locale: "vi", by: "t" });
    expect(taken.ok ? "" : taken.problem.errors?.[0]?.field).toBe("key");
    const copy = await createMenu({
      website_id: site.id,
      key: "main",
      locale: "en",
      copy_from: menu.id,
      by: "t",
    });
    if (!copy.ok) throw new Error(copy.problem.detail);
    expect(flatten(copy.data.items).length).toBe(flatten(menu.items).length);
    expect(copy.data.items[0]?.id).not.toBe(menu.items[0]?.id);
  });

  it("nhập menu cũ: chạy thử không ghi; chạy lại không nhân đôi; menu đã có thì giữ", async () => {
    const site = (await listWebsites()).data[0];
    if (!site) throw new Error("thiếu website mẫu");
    const legacy = [
      {
        id: "m1",
        key: "blog",
        locale: "vi",
        items: [
          { id: "o1", label: "Tất cả bài", url: "/goc-bep", children: [] },
          {
            id: "o2",
            label: "Chọn mua",
            term_id: "01a1e000-0000-7000-8000-0000000000f1",
            children: [],
          },
        ],
      },
      {
        id: "m2",
        key: "main",
        locale: "vi",
        items: [{ id: "o3", label: "x", url: "/", children: [] }],
      },
    ];
    const dry = await importLegacy(legacy, site.id, true, "t");
    expect(dry.data.map((r) => r.status)).toEqual(["create", "keep"]);
    expect((await listMenus(site.id)).data.some((m) => m.key === "blog")).toBe(false);
    const run = await importLegacy(legacy, site.id, false, "t");
    expect(run.data.map((r) => r.status)).toEqual(["created", "keep"]);
    const again = await importLegacy(legacy, site.id, false, "t");
    expect(again.data.map((r) => r.status)).toEqual(["keep", "keep"]);
    const blog = (await listMenus(site.id)).data.filter((m) => m.key === "blog");
    expect(blog).toHaveLength(1);
    const opened = await getMenu(blog[0]?.id ?? "");
    expect(opened.ok && opened.data.menu.items.map((i) => i.ref_kind)).toEqual([
      null,
      "content.term",
    ]);
  });
});
