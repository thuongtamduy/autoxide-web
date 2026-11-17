// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { groupListings } from "@/lib/channels";
import { renderIntl } from "@/test/render";
import { ChannelChips } from "./listing-chips";

afterEach(cleanup);

describe("ChannelChips", () => {
  it("mỗi tài khoản một chip có trạng thái, chưa gắn mã là Chưa đăng", () => {
    const accounts = [
      { id: "a", name: "Bếp Mộc Official", kind: "shopee" },
      { id: "b", name: "Bếp Mộc Quận 3", kind: "tiktok_shop" },
      { id: "c", name: "Bếp Mộc Hà Nội", kind: "shopee" },
    ];
    const base = { variant_id: "v", sku: "BG6", name: "Bộ bát", external_sku: "BG6" };
    const [product] = groupListings(
      [
        {
          ...base,
          account_id: "a",
          account_name: "Bếp Mộc Official",
          kind: "shopee",
          status: "rejected",
        },
        {
          ...base,
          account_id: "b",
          account_name: "Bếp Mộc Quận 3",
          kind: "tiktok_shop",
          status: "live",
        },
      ],
      accounts,
    );
    renderIntl(<ChannelChips slots={product?.slots ?? []} href="/x?open=v" />, "vi");
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]?.getAttribute("aria-label")).toBe("Bếp Mộc Official (Shopee): Kênh từ chối");
    expect(links[0]?.textContent).toContain("Lỗi");
    expect(links[1]?.textContent).toContain("Đang bán");
    expect(links[2]?.textContent).toContain("Chưa đăng");
    expect(links[2]?.className).toContain("b-draft");
    expect(links[0]?.getAttribute("href")).toBe("/x?open=v");
  });
});
