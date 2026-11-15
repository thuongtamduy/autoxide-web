import { describe, expect, it } from "vitest";
import { destinations, filterDestinations, fold } from "@/components/shell/command-palette";
import { initialsOf } from "@/lib/initials";
import { isTheme, themeClass } from "@/lib/theme";
import { activePage, type NavGroup, visibleNav } from "./nav";

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
