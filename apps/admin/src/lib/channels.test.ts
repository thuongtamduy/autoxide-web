import { describe, expect, it } from "vitest";
import {
  channelState,
  groupListings,
  type ListingLike,
  listingCounts,
  matchesListing,
  pageOf,
} from "./channels";

const ACCOUNTS = [
  { id: "shp", name: "Bếp Mộc Official", kind: "shopee" },
  { id: "tts", name: "Bếp Mộc Quận 3", kind: "tiktok_shop" },
  { id: "hn", name: "Bếp Mộc Hà Nội", kind: "shopee" },
];

const row = (
  account_id: string,
  sku: string,
  name: string,
  status: string,
  external_sku = `${sku}-${account_id}`,
): ListingLike => ({
  account_id,
  account_name: ACCOUNTS.find((a) => a.id === account_id)?.name ?? "Lazada cũ",
  kind: ACCOUNTS.find((a) => a.id === account_id)?.kind ?? "lazada",
  variant_id: `v-${sku}`,
  sku,
  name,
  external_sku,
  status,
});

const LISTINGS = [
  row("shp", "CG26", "Chảo gang 26cm", "live"),
  row("tts", "CG26", "Chảo gang 26cm", "live"),
  row("hn", "CG26", "Chảo gang 26cm", "live"),
  row("shp", "BG6", "Bộ bát gốm 6 món", "error"),
  row("shp", "TG35", "Thớt gỗ 35cm", "draft"),
  row("hn", "TG35", "Thớt gỗ 35cm", "live", "TG35-HN"),
  row("tts", "NI20", "Nồi inox 20cm", "pending"),
  row("old", "NI20", "Nồi inox 20cm", "delisted"),
];

describe("gom tin đăng theo sản phẩm", () => {
  it("mỗi sản phẩm một dòng, mỗi tài khoản một ô, xếp theo tên", () => {
    const products = groupListings(LISTINGS, ACCOUNTS);
    expect(products.map((p) => p.sku)).toEqual(["BG6", "CG26", "NI20", "TG35"]);
    const cg = products.find((p) => p.sku === "CG26");
    expect(cg?.slots.map((s) => s.state)).toEqual(["live", "live", "live", "off"]);
    // Tài khoản ngoài danh sách vẫn còn liên kết thì thêm ở cuối, không mất liên kết.
    expect(cg?.slots.map((s) => s.account.id)).toEqual(["shp", "tts", "hn", "old"]);
    const bg = products.find((p) => p.sku === "BG6");
    expect(bg?.slots[0]?.state).toBe("error");
    expect(bg?.slots[1]?.listing).toBeNull();
  });

  it("trạng thái gộp", () => {
    expect(channelState("live")).toBe("live");
    expect(channelState("rejected")).toBe("error");
    expect(channelState("error")).toBe("error");
    expect(channelState("pending")).toBe("pending");
    expect(channelState("draft")).toBe("off");
    expect(channelState("delisted")).toBe("off");
    expect(channelState(null)).toBe("off");
  });

  it("tìm không dấu theo tên, SKU, mã trên kênh; lọc theo tài khoản và trạng thái", () => {
    const products = groupListings(LISTINGS, ACCOUNTS);
    const find = (filter: Parameters<typeof matchesListing>[1]) =>
      products.filter((p) => matchesListing(p, filter)).map((p) => p.sku);
    expect(find({ q: "chao gang" })).toEqual(["CG26"]);
    expect(find({ q: "tg35-hn" })).toEqual(["TG35"]);
    // Chỉ tài khoản: sản phẩm đã gắn mã trên tài khoản đó.
    expect(find({ account: "hn" })).toEqual(["CG26", "TG35"]);
    expect(find({ state: "error" })).toEqual(["BG6"]);
    // "Chưa đăng" trên một tài khoản tính cả chưa gắn mã.
    expect(find({ account: "tts", state: "off" })).toEqual(["BG6", "TG35"]);
    expect(find({ account: "shp", state: "live" })).toEqual(["CG26"]);
  });

  it("số đếm khớp kết quả khi bấm", () => {
    const products = groupListings(LISTINGS, ACCOUNTS);
    const counts = listingCounts(products, { account: "hn" });
    expect(counts.all).toBe(2);
    expect(counts.states.live).toBe(2);
    expect(counts.states.off).toBe(2);
    expect(counts.accounts).toEqual({ shp: 3, tts: 2, hn: 2, old: 1 });
    expect(listingCounts(products, {}).all).toBe(4);
  });
});

describe("phân trang", () => {
  it("cắt trang, trang ngoài khoảng về trang gần nhất", () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    expect(pageOf(items, 1, 20)).toMatchObject({ page: 1, pages: 3, from: 1, to: 20 });
    expect(pageOf(items, 3, 20).items).toHaveLength(5);
    expect(pageOf(items, 9, 20)).toMatchObject({ page: 3, from: 41, to: 45 });
    expect(pageOf(items, Number.NaN, 20).page).toBe(1);
    expect(pageOf([], 1, 20)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0 });
  });
});
