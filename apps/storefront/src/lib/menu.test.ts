import { describe, expect, it } from "vitest";
import { sampleFooterMenu, sampleMainMenu } from "@/sample/menus";
import { footerColumns, groupsOf, splitMainMenu, toLink } from "./menu";
import type { SiteMenuItem } from "./types";

const item = (
  label: string,
  href: string | null,
  extra: Partial<SiteMenuItem> = {},
): SiteMenuItem => ({
  label,
  href,
  children: [],
  ...extra,
});

describe("link của menu", () => {
  it("trong site, ngoài site, và địa chỉ không nhận", () => {
    expect(toLink("A", "/blog")).toEqual({ label: "A", href: "/blog", external: false });
    expect(toLink("B", "mailto:hotro@example.com")?.external).toBe(true);
    expect(toLink("C", "https://example.com")?.external).toBe(true);
    expect(toLink("D", "//evil.example")).toBeNull();
    expect(toLink("E", "javascript:alert(1)")).toBeNull();
    expect(toLink("F", null)).toBeNull();
  });
});

describe("menu main", () => {
  it("mục có highlight dồn phải; mục rỗng bị bỏ; icon lạ thành null", () => {
    const { categories, specials } = splitMainMenu([
      item("Bếp", "/danh-muc/bep", { icon: "fire" }),
      item("Rỗng", null),
      item("Khuyến mại", "/khuyen-mai", { highlight: "sale", icon: "không-có" }),
    ]);
    expect(categories.map((c) => c.label)).toEqual(["Bếp"]);
    expect(categories[0]?.icon).toBe("fire");
    expect(specials.map((c) => [c.label, c.highlight, c.icon])).toEqual([
      ["Khuyến mại", "sale", null],
    ]);
  });

  it("con lá thành nhóm mặc định; con có con thành cột có tiêu đề", () => {
    const groups = groupsOf(
      item("Hỗ trợ", null, {
        children: [
          item("Tra cứu đơn hàng", "/tra-cuu-don-hang"),
          item("Nhóm", null, { children: [item("Gửi thư", "mailto:a@example.com")] }),
        ],
      }),
    );
    expect(groups).toEqual([
      {
        heading: null,
        links: [{ label: "Tra cứu đơn hàng", href: "/tra-cuu-don-hang", external: false }],
      },
      {
        heading: "Nhóm",
        links: [{ label: "Gửi thư", href: "mailto:a@example.com", external: true }],
      },
    ]);
  });

  it("menu mẫu: năm danh mục và ba lối vào đặc biệt", () => {
    const { categories, specials } = splitMainMenu(sampleMainMenu("vi").items);
    expect(categories).toHaveLength(5);
    expect(specials.map((s) => s.highlight)).toEqual(["sale", "brand", "accent"]);
    expect(categories[0]?.groups[0]?.links.map((l) => l.label)).toEqual(["Chảo", "Nồi"]);
    expect(splitMainMenu(sampleMainMenu("en").items).categories[0]?.label).toBe("Kitchen");
  });
});

describe("menu footer", () => {
  it("mục có con là cột; mục lá gom vào cột cuối", () => {
    expect(
      footerColumns([
        item("Hỗ trợ", null, { children: [item("Đổi trả", "/doi-tra")] }),
        item("Về chúng tôi", "/ve-chung-toi"),
      ]),
    ).toEqual([
      { heading: "Hỗ trợ", links: [{ label: "Đổi trả", href: "/doi-tra", external: false }] },
      { heading: null, links: [{ label: "Về chúng tôi", href: "/ve-chung-toi", external: false }] },
    ]);
  });

  it("menu mẫu có ba cột", () => {
    expect(footerColumns(sampleFooterMenu("vi").items).map((c) => c.heading)).toEqual([
      "Mua sắm",
      "Hỗ trợ",
      "Về chúng tôi",
    ]);
  });
});
