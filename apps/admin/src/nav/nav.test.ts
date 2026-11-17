import { describe, expect, it } from "vitest";
import {
  destinationAt,
  destinations,
  filterDestinations,
  hitIcon,
  pushRecent,
  RECENT_MAX,
  suggestions,
} from "@/components/shell/command-items";
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

  const groups = [
    {
      id: "content",
      label: "Nội dung",
      icon: "page" as const,
      pages: [
        { id: "posts", label: "Bài viết", href: "/content" },
        { id: "media", label: "Thư viện media", href: "/content/media" },
      ],
    },
    {
      id: "settings",
      label: "Cài đặt",
      icon: "gear" as const,
      pages: [{ id: "plan", label: "Gói", href: "/settings/plan" }],
    },
  ];
  const all = destinations(groups, [
    { id: "account", label: "Tài khoản của tôi", href: "/account", icon: "user" },
  ]);

  it("mỗi dòng mang icon của phân hệ; kết quả tìm mang icon theo loại", () => {
    expect(all.map((d) => d.icon)).toEqual(["page", "page", "gear", "user"]);
    expect(hitIcon("media/1")).toBe("image");
    expect(hitIcon("user/1")).toBe("user");
    expect(hitIcon("entry/1")).toBe("page");
  });

  it("gần đây: màn mới lên đầu, không trùng, giữ tối đa RECENT_MAX", () => {
    let keys: string[] = [];
    for (const key of ["a", "b", "a", "c", "d", "e", "f"]) keys = pushRecent(keys, key);
    expect(keys).toEqual(["f", "e", "d", "c", "a"]);
    expect(keys).toHaveLength(RECENT_MAX);
  });

  it("tìm màn theo địa chỉ, bỏ chuỗi truy vấn", () => {
    expect(destinationAt(all, "/content/media")?.key).toBe("content/media");
    expect(destinationAt(all, "/content/abc")).toBeUndefined();
  });

  it("chưa gõ gì: màn gần đây nếu có (bỏ màn đã mất), không thì màn đầu của mỗi phân hệ", () => {
    const recent = suggestions(all, groups, ["settings/plan", "gone/page", "content/media"]);
    expect(recent.kind).toBe("recent");
    expect(recent.items.map((d) => d.key)).toEqual(["settings/plan", "content/media"]);

    const areas = suggestions(all, groups, ["gone/page"]);
    expect(areas.kind).toBe("areas");
    expect(areas.items.map((d) => [d.label, d.href, d.context])).toEqual([
      ["Nội dung", "/content", ""],
      ["Cài đặt", "/settings/plan", ""],
    ]);
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
  it("Bài viết, Trang và cấu trúc, Menu, Thư viện media theo thứ tự", () => {
    const admin: Viewer = {
      allPermissions: true,
      permissions: [],
      modules: ["content", "menus", "media"],
      sample: true,
    };
    const content = visibleNav(admin, REAL_NAV).find((g) => g.id === "content");
    expect(content?.pages.map((p) => p.href)).toEqual([
      "/content",
      "/content/structure",
      "/content/menus",
      "/content/media",
    ]);
    // Thiếu module `menus` thì không có Menu (tắt dữ liệu mẫu không ảnh hưởng); thiếu `media` thì
    // không có Thư viện media.
    expect(
      visibleNav({ ...admin, sample: false }, REAL_NAV)
        .find((g) => g.id === "content")
        ?.pages.map((p) => p.id),
    ).toContain("menus");
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
    expect(real.map((g) => g.id).slice(0, 4)).toEqual(["home", "sales", "catalog", "mkt"]);
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

describe("Cây tổ chức và phân hệ Tuân thủ (dữ liệu mẫu, W-012)", () => {
  const admin: Viewer = {
    allPermissions: true,
    permissions: [],
    modules: ["organizations"],
    sample: true,
  };

  it("Cây tổ chức đứng trước Người dùng và role; Tuân thủ đứng sau Tổ chức, trước Cài đặt", () => {
    const nav = visibleNav(admin, REAL_NAV);
    expect(nav.find((g) => g.id === "org")?.pages.map((p) => p.id)).toEqual(["orgTree", "access"]);
    const ids = nav.map((g) => g.id);
    expect(ids.indexOf("legal")).toBe(ids.indexOf("org") + 1);
    expect(ids.indexOf("settings")).toBe(ids.indexOf("legal") + 1);
    expect(nav.find((g) => g.id === "legal")?.pages.map((p) => p.href)).toEqual([
      "/compliance",
      "/compliance/records",
    ]);
    expect(activePage(REAL_NAV, "/org")?.page.id).toBe("orgTree");
    expect(activePage(REAL_NAV, "/org/access/users")?.page.id).toBe("access");
    expect(activePage(REAL_NAV, "/compliance/kyc")?.page.id).toBe("compliance");
    expect(activePage(REAL_NAV, "/compliance/records/cases")?.page.id).toBe("complianceRecords");
  });

  it("tắt dữ liệu mẫu thì không có; người thiếu permission dự kiến thì không thấy", () => {
    const off = visibleNav({ ...admin, sample: false }, REAL_NAV);
    expect(off.find((g) => g.id === "legal")).toBeUndefined();
    // Cây tổ chức là API thật: vẫn hiện khi tắt dữ liệu mẫu (khi core có module `organizations`).
    expect(off.find((g) => g.id === "org")?.pages.map((p) => p.id)).toEqual(["orgTree", "access"]);
    const legal = visibleNav(
      { allPermissions: false, permissions: ["compliance.kyc.read"], modules: [], sample: true },
      REAL_NAV,
    );
    expect(legal.find((g) => g.id === "legal")?.pages.map((p) => p.id)).toEqual(["compliance"]);
    expect(legal.find((g) => g.id === "org")).toBeUndefined();
  });
});

describe("hai không gian: khách và mặt điều khiển nền tảng (W-014)", () => {
  it("đường dẫn dưới /platform là mặt điều khiển, còn lại là không gian khách", async () => {
    const { workspaceOf, navOf, NAV_PLATFORM } = await import("./nav");
    expect(workspaceOf("/platform")).toBe("platform");
    expect(workspaceOf("/platform/tenants/1")).toBe("platform");
    expect(workspaceOf("/platformx")).toBe("tenant");
    expect(workspaceOf("/")).toBe("tenant");
    expect(navOf("platform")).toBe(NAV_PLATFORM);
    expect(navOf("tenant")).toBe(REAL_NAV);
  });

  it("sổ nền tảng: bảy mục theo bản thiết kế, theo permission của nhân sự vận hành; khách, cấp phát, đội database và vào dữ liệu khách là API thật", async () => {
    const { NAV_PLATFORM } = await import("./nav");
    const ids = (viewer: Partial<Viewer>) =>
      visibleNav(
        { allPermissions: false, permissions: [], modules: [], ...viewer },
        NAV_PLATFORM,
      ).map((g) => g.id);
    expect(ids({ allPermissions: true, sample: true })).toEqual([
      "platformTenants",
      "platformPlans",
      "platformSubscriptions",
      "platformProvisioning",
      "platformFleet",
      "platformHealth",
      "platformSupport",
    ]);
    expect(ids({ allPermissions: true, sample: false })).toEqual([
      "platformTenants",
      "platformProvisioning",
      "platformFleet",
      "platformSupport",
    ]);
    expect(ids({ permissions: ["kernel.ops.read", "auth.support.grant"], sample: true })).toEqual([
      "platformHealth",
      "platformSupport",
    ]);
    expect(activePage(NAV_PLATFORM, "/platform/tenants/abc")?.page.id).toBe("platformTenants");
    expect(activePage(NAV_PLATFORM, "/platform/plans/overrides")?.page.id).toBe("platformPlans");
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

describe("nhóm Tài chính (dữ liệu mẫu, bước 36)", () => {
  it("đứng sau Nội dung, trước Tổ chức; chỉ hiện khi bật dữ liệu mẫu, theo permission dự kiến", async () => {
    const { NAV: real } = await import("./nav");
    const ids = real.map((g) => g.id);
    // Sàn (W-018) đứng giữa Nội dung và Tài chính như `RAIL_TENANT` (Khách hàng, bước 47, chưa dựng).
    // Khách hàng (W-019) đứng giữa Nội dung và Sàn, đúng thứ tự `RAIL_TENANT`.
    expect(ids.indexOf("buyers")).toBe(ids.indexOf("content") + 1);
    expect(ids.indexOf("market")).toBe(ids.indexOf("buyers") + 1);
    expect(ids.indexOf("finance")).toBe(ids.indexOf("market") + 1);
    expect(ids.indexOf("org")).toBe(ids.indexOf("finance") + 1);
    const group = real.find((g) => g.id === "finance");
    expect(group?.icon).toBe("wallet");
    expect(group?.pages.map((p) => p.href)).toEqual(["/finance"]);
    const off = visibleNav({ allPermissions: true, permissions: [], modules: [] }, real);
    expect(off.some((g) => g.id === "finance")).toBe(false);
    const clerk = visibleNav(
      { allPermissions: false, permissions: ["invoices.read"], modules: [], sample: true },
      real,
    );
    expect(clerk.find((g) => g.id === "finance")?.pages.map((p) => p.id)).toEqual(["finance"]);
    const stranger = visibleNav(
      { allPermissions: false, permissions: ["forms.read"], modules: [], sample: true },
      real,
    );
    expect(stranger.some((g) => g.id === "finance")).toBe(false);
    expect(activePage(real, "/finance/einvoices")?.page.id).toBe("finance");
  });
});

describe("Khuyến mại và Vận chuyển (dữ liệu mẫu, bước 43–44)", () => {
  it("Khuyến mại đứng đầu nhóm Tiếp thị; Vận chuyển ở nhóm Bán hàng (biểu tượng cart)", async () => {
    const { NAV: real } = await import("./nav");
    const admin: Viewer = {
      allPermissions: true,
      permissions: [],
      modules: ["forms", "newsletter", "comments"],
      sample: true,
    };
    const nav = visibleNav(admin, real);
    expect(nav.find((g) => g.id === "mkt")?.pages.map((p) => p.id)).toEqual([
      "promotions",
      "forms",
      "newsletter",
      "comments",
      "affiliate",
    ]);
    const sales = real.find((g) => g.id === "sales");
    expect(sales?.icon).toBe("cart");
    // Đơn hàng đứng đầu nhóm, rồi Vận chuyển, rồi Cửa hàng (W-017).
    expect(sales?.pages.map((p) => p.href)).toEqual([
      "/sales/orders",
      "/sales/shipping",
      "/sales/stores",
      "/sales/channels",
    ]);
    // Tắt dữ liệu mẫu: không còn Khuyến mại, cả nhóm Bán hàng biến mất.
    const off = visibleNav({ ...admin, sample: false }, real);
    expect(off.some((g) => g.id === "sales")).toBe(false);
    expect(off.find((g) => g.id === "mkt")?.pages[0]?.id).toBe("forms");
    // Nhân viên chỉ có quyền đối soát COD vẫn thấy Vận chuyển; không có quyền khuyến mại thì không thấy.
    const clerk = visibleNav(
      { allPermissions: false, permissions: ["shipping.cod.manage"], modules: [], sample: true },
      real,
    );
    // (Cài đặt luôn có màn API key của chính người đăng nhập.)
    expect(clerk.map((g) => g.id)).toEqual(["home", "sales", "settings"]);
    expect(activePage(real, "/sales/shipping/cod")?.page.id).toBe("shipping");
    expect(activePage(real, "/marketing/promotions/flash")?.page.id).toBe("promotions");
    expect(activePage(real, "/sales/orders/returns")?.page.id).toBe("orders");
    expect(activePage(real, "/sales/stores/shifts")?.page.id).toBe("stores");
    // Thu ngân chỉ có quyền ca thu ngân thấy Cửa hàng mà không thấy Đơn hàng.
    const cashier = visibleNav(
      { allPermissions: false, permissions: ["orders.pos.shift"], modules: [], sample: true },
      real,
    );
    expect(cashier.find((g) => g.id === "sales")?.pages.map((p) => p.id)).toEqual(["stores"]);
  });
});

describe("Sàn và Trung tâm người bán (dữ liệu mẫu, bước 46, W-018)", () => {
  it("Vận hành sàn: biểu tượng store, theo permission dự kiến, chỉ khi bật dữ liệu mẫu", async () => {
    const { NAV: real } = await import("./nav");
    const group = real.find((g) => g.id === "market");
    expect(group?.icon).toBe("store");
    expect(group?.pages.map((p) => p.href)).toEqual(["/market"]);
    const off = visibleNav({ allPermissions: true, permissions: [], modules: [] }, real);
    expect(off.some((g) => g.id === "market")).toBe(false);
    const judge = visibleNav(
      {
        allPermissions: false,
        permissions: ["marketplace.disputes.resolve"],
        modules: [],
        sample: true,
      },
      real,
    );
    expect(judge.find((g) => g.id === "market")?.pages.map((p) => p.id)).toEqual(["market"]);
    // Người bán (chỉ `marketplace.sell`) không thấy màn vận hành của sàn.
    const seller = visibleNav(
      { allPermissions: false, permissions: ["marketplace.sell"], modules: [], sample: true },
      real,
    );
    expect(seller.some((g) => g.id === "market")).toBe(false);
    expect(activePage(real, "/market/payouts")?.page.id).toBe("market");
  });

  it("không gian thứ ba: /seller, năm mục theo RAIL_SELLER, không trộn với sổ của khách", async () => {
    const { workspaceOf, navOf, NAV_SELLER, NAV: real } = await import("./nav");
    expect(workspaceOf("/seller")).toBe("seller");
    expect(workspaceOf("/seller/money")).toBe("seller");
    expect(workspaceOf("/sellers")).toBe("tenant");
    expect(workspaceOf("/market")).toBe("tenant");
    expect(navOf("seller")).toBe(NAV_SELLER);
    expect(NAV_SELLER.map((g) => [g.icon, g.pages[0]?.href])).toEqual([
      ["home", "/seller"],
      ["cart", "/seller/orders"],
      ["box", "/seller/products"],
      ["store", "/seller/shop"],
      ["wallet", "/seller/money"],
    ]);
    const hrefs = real.flatMap((g) => g.pages.map((p) => p.href));
    expect(hrefs.some((h) => h.startsWith("/seller"))).toBe(false);
    const ids = (viewer: Partial<Viewer>) =>
      visibleNav({ allPermissions: false, permissions: [], modules: [], ...viewer }, NAV_SELLER)
        .length;
    expect(ids({ permissions: ["marketplace.sell"], sample: true })).toBe(5);
    expect(ids({ permissions: ["marketplace.sellers.read"], sample: true })).toBe(5);
    expect(ids({ permissions: ["marketplace.sell"], sample: false })).toBe(0);
    expect(ids({ permissions: ["orders.read"], sample: true })).toBe(0);
    expect(activePage(NAV_SELLER, "/seller/shop/performance")?.page.id).toBe("sellerShop");
    expect(activePage(NAV_SELLER, "/seller")?.page.id).toBe("sellerHome");
  });
});

describe("Khách hàng, Kênh bán, Tiếp thị liên kết (dữ liệu mẫu, bước 47–49, W-019)", () => {
  it("Khách hàng là nhóm riêng sau Nội dung (biểu tượng user); Kênh bán cuối Bán hàng; Tiếp thị liên kết cuối Tiếp thị", async () => {
    const { NAV: real } = await import("./nav");
    const ids = real.map((g) => g.id);
    expect(ids.indexOf("buyers")).toBe(ids.indexOf("content") + 1);
    const buyers = real.find((g) => g.id === "buyers");
    expect(buyers?.icon).toBe("user");
    expect(buyers?.pages.map((p) => p.href)).toEqual(["/customers"]);
    expect(real.find((g) => g.id === "sales")?.pages.at(-1)?.href).toBe("/sales/channels");
    expect(real.find((g) => g.id === "mkt")?.pages.at(-1)?.href).toBe("/marketing/affiliate");
    // Tắt dữ liệu mẫu: không còn nhóm Khách hàng, không có Kênh bán hay Tiếp thị liên kết.
    const admin: Viewer = { allPermissions: true, permissions: [], modules: [], sample: false };
    const off = visibleNav(admin, real);
    expect(off.some((g) => g.id === "buyers")).toBe(false);
    expect(off.flatMap((g) => g.pages).some((p) => p.id === "affiliate")).toBe(false);
    // Kế toán chỉ có quyền đối soát kênh thấy Kênh bán; nhân viên rủi ro COD thấy Khách hàng.
    const accountant = visibleNav(
      { allPermissions: false, permissions: ["channels.finance.read"], modules: [], sample: true },
      real,
    );
    expect(accountant.find((g) => g.id === "sales")?.pages.map((p) => p.id)).toEqual(["channels"]);
    const risk = visibleNav(
      { allPermissions: false, permissions: ["orders.risk.manage"], modules: [], sample: true },
      real,
    );
    expect(risk.find((g) => g.id === "buyers")?.pages.map((p) => p.id)).toEqual(["customers"]);
    // Người tiếp thị đăng nhập (chỉ `affiliate.partner`) thấy màn Tiếp thị liên kết (góc của mình).
    const partner = visibleNav(
      { allPermissions: false, permissions: ["affiliate.partner"], modules: [], sample: true },
      real,
    );
    expect(partner.find((g) => g.id === "mkt")?.pages.map((p) => p.id)).toEqual(["affiliate"]);
    expect(activePage(real, "/customers/cod")?.page.id).toBe("customers");
    expect(activePage(real, "/sales/channels/inbound")?.page.id).toBe("channels");
    expect(activePage(real, "/marketing/affiliate/payouts")?.page.id).toBe("affiliate");
  });
});
