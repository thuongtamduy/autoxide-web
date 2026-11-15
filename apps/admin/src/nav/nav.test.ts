import { describe, expect, it } from "vitest";
import { destinations, filterDestinations } from "@/components/shell/command-palette";
import { fold } from "@/lib/fold";
import { initialsOf } from "@/lib/initials";
import { isTheme, themeClass } from "@/lib/theme";
import { activePage, type NavGroup, NAV as REAL_NAV, type Viewer, visibleNav } from "./nav";

const NAV: NavGroup[] = [
  { id: "home", icon: "home", pages: [{ id: "dashboard", href: "/", exact: true }] },
  {
    id: "content",
    icon: "posts",
    pages: [
      { id: "entries", href: "/content", module: "content", permission: "content.read" },
      { id: "media", href: "/content/media", module: "media", permission: "media.read" },
    ],
  },
  {
    id: "settings",
    icon: "gear",
    pages: [{ id: "modules", href: "/settings/modules", permission: "kernel.modules.read" }],
  },
];

describe("visibleNav", () => {
  it("admin thấy mọi màn có module đã cài", () => {
    const nav = visibleNav(
      { allPermissions: true, permissions: [], modules: ["kernel", "content"] },
      NAV,
    );
    expect(nav.map((g) => g.id)).toEqual(["home", "content", "settings"]);
    // module media chưa cài: màn thư viện media không hiện
    expect(nav[1]?.pages.map((p) => p.id)).toEqual(["entries"]);
  });

  it("thiếu permission thì bỏ màn, nhóm hết màn thì bỏ nhóm", () => {
    const nav = visibleNav(
      { allPermissions: false, permissions: ["content.read"], modules: ["content", "media"] },
      NAV,
    );
    expect(nav.map((g) => g.id)).toEqual(["home", "content"]);
    expect(nav[1]?.pages.map((p) => p.id)).toEqual(["entries"]);
  });

  it("permission là danh sách: có một trong số đó là đủ", () => {
    const nav: NavGroup[] = [
      {
        id: "org",
        icon: "org",
        pages: [{ id: "access", href: "/org/access", permission: ["a.read", "b.read"] }],
      },
    ];
    const see = (permissions: string[]) =>
      visibleNav({ allPermissions: false, permissions, modules: null }, nav).length;
    expect(see(["b.read"])).toBe(1);
    expect(see(["c.read"])).toBe(0);
  });

  it("nhóm Cài đặt thật: Cài đặt chung theo một trong các permission; API key ai cũng thấy", async () => {
    const { NAV: real } = await import("./nav");
    const pages = (viewer: Partial<Viewer>) =>
      visibleNav({ allPermissions: false, permissions: [], modules: null, ...viewer }, real)
        .find((g) => g.id === "settings")
        ?.pages.map((p) => p.id);
    expect(pages({})).toEqual(["apiKeys"]);
    expect(pages({ permissions: ["audit.read"] })).toEqual(["general", "apiKeys"]);
    expect(pages({ permissions: ["webhooks.manage"] })).toEqual([
      "general",
      "apiKeys",
      "developers",
    ]);
    expect(activePage(real, "/settings/modules/notes")?.page.id).toBe("general");
    expect(activePage(real, "/settings/api-keys/new")?.page.id).toBe("apiKeys");
  });

  it("màn dữ liệu mẫu: chỉ hiện khi bật mẫu, không đòi module, vẫn theo permission", () => {
    const nav: NavGroup[] = [
      {
        id: "sales",
        icon: "cart",
        pages: [
          {
            id: "orders",
            href: "/sales/orders",
            module: "orders",
            permission: "orders.read",
            sample: { step: "45" },
          },
        ],
      },
    ];
    const see = (viewer: Partial<Viewer>) =>
      visibleNav({ allPermissions: false, permissions: [], modules: [], ...viewer }, nav).length;
    expect(see({ allPermissions: true, sample: true })).toBe(1);
    expect(see({ allPermissions: true, sample: false })).toBe(0);
    expect(see({ allPermissions: true })).toBe(0);
    expect(see({ permissions: ["orders.read"], sample: true })).toBe(1);
    expect(see({ permissions: [], sample: true })).toBe(0);
  });

  it("không xem được sổ module thì chỉ lọc theo permission", () => {
    const nav = visibleNav(
      { allPermissions: false, permissions: ["media.read"], modules: null },
      NAV,
    );
    expect(nav[1]?.pages.map((p) => p.id)).toEqual(["media"]);
  });
});

describe("activePage", () => {
  it.each([
    ["/", "dashboard"],
    ["/content", "entries"],
    ["/content/123", "entries"],
    ["/content/media", "media"],
    ["/content/media/abc", "media"],
    ["/settings/modules/notes", "modules"],
  ])("%s → %s", (path, page) => {
    expect(activePage(NAV, path)?.page.id).toBe(page);
  });

  it("đường dẫn lạ không khớp màn nào (trang gốc chỉ khớp đúng /)", () => {
    expect(activePage(NAV, "/contentx")).toBeNull();
    expect(activePage(NAV, "/account")).toBeNull();
  });
});

describe("bảng lệnh", () => {
  it("tìm không cần dấu", () => {
    expect(fold("  Đơn Hàng ")).toBe("don hang");
    const list = destinations(
      [
        {
          id: "settings",
          label: "Cài đặt",
          icon: "gear",
          pages: [{ id: "modules", label: "Module", href: "/settings/modules" }],
        },
      ],
      [{ id: "account", label: "Tài khoản của tôi", href: "/account" }],
    );
    expect(filterDestinations(list, "cai dat").map((d) => d.href)).toEqual(["/settings/modules"]);
    expect(filterDestinations(list, "tai khoan").map((d) => d.href)).toEqual(["/account"]);
    expect(filterDestinations(list, "")).toHaveLength(2);
  });
});

describe("tiện ích nhỏ", () => {
  it.each([
    ["Lan Phạm", "LP"],
    ["ada@example.com", "AD"],
    ["ada.lovelace@example.com", "AL"],
    ["", "?"],
  ])("initialsOf(%j) = %s", (name, out) => {
    expect(initialsOf(name)).toBe(out);
  });

  it("giao diện: chỉ nhận light / dark / system; theo máy thì không đặt lớp", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("blue")).toBe(false);
    expect(themeClass("light")).toBe("light");
    expect(themeClass("system")).toBeUndefined();
    expect(themeClass(undefined)).toBeUndefined();
  });
});

describe("phân hệ Nội dung trong sổ thật", () => {
  it("Bài viết, Trang và cấu trúc, Menu (dữ liệu mẫu), Thư viện media theo thứ tự", () => {
    const admin: Viewer = {
      allPermissions: true,
      permissions: [],
      modules: ["content", "media"],
      sample: true,
    };
    const content = visibleNav(admin, REAL_NAV).find((g) => g.id === "content");
    expect(content?.pages.map((p) => p.href)).toEqual([
      "/content",
      "/content/structure",
      "/content/menus",
      "/content/media",
    ]);
    // Tắt dữ liệu mẫu thì không có Menu; thiếu module `media` thì không có Thư viện media.
    const plain = visibleNav({ ...admin, sample: false, modules: ["content"] }, REAL_NAV);
    expect(plain.find((g) => g.id === "content")?.pages.map((p) => p.id)).toEqual([
      "entries",
      "structure",
    ]);
    expect(activePage(REAL_NAV, "/content/media")?.page.id).toBe("media");
    expect(activePage(REAL_NAV, "/content/structure/terms")?.page.id).toBe("structure");
    expect(activePage(REAL_NAV, "/content/0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81")?.page.id).toBe(
      "entries",
    );
  });
});

describe("nhóm Tiếp thị", () => {
  it("đứng sau Tổng quan và Sản phẩm; mỗi màn theo module và permission của nó", async () => {
    const { NAV: real } = await import("./nav");
    expect(real.map((g) => g.id).slice(0, 3)).toEqual(["home", "catalog", "mkt"]);
    const nav = visibleNav(
      {
        allPermissions: false,
        permissions: ["forms.read", "comments.export"],
        modules: ["forms", "newsletter", "comments"],
      },
      real,
    );
    expect(nav.find((g) => g.id === "mkt")?.pages.map((p) => p.id)).toEqual(["forms", "comments"]);
    const missing = visibleNav({ allPermissions: true, permissions: [], modules: ["forms"] }, real);
    expect(missing.find((g) => g.id === "mkt")?.pages.map((p) => p.id)).toEqual(["forms"]);
  });
});

describe("nhóm Sản phẩm (dữ liệu mẫu, bước 41–42)", () => {
  it("đứng ngay sau Tổng quan; hai màn chỉ hiện khi bật dữ liệu mẫu, theo permission dự kiến", async () => {
    const { NAV: real } = await import("./nav");
    const group = real.find((g) => g.id === "catalog");
    expect(group?.icon).toBe("box");
    expect(group?.pages.map((p) => p.href)).toEqual(["/catalog", "/catalog/inventory"]);
    const off = visibleNav({ allPermissions: true, permissions: [], modules: [] }, real);
    expect(off.some((g) => g.id === "catalog")).toBe(false);
    const clerk = visibleNav(
      { allPermissions: false, permissions: ["inventory.read"], modules: [], sample: true },
      real,
    );
    expect(clerk.find((g) => g.id === "catalog")?.pages.map((p) => p.id)).toEqual(["inventory"]);
    // Đường dẫn dài hơn thắng: /catalog/inventory/moves thuộc Tồn kho, /catalog/prices thuộc Sản phẩm và giá.
    expect(activePage(real, "/catalog/inventory/moves")?.page.id).toBe("inventory");
    expect(activePage(real, "/catalog/prices")?.page.id).toBe("catalog");
  });
});
