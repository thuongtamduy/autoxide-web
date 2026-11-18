import { describe, expect, it } from "vitest";
import { badgeView, formatAddress, ownerView } from "./legal";
import type { PublicBadge, PublicOwner } from "./types";

const owner = (extra: Partial<PublicOwner> = {}): PublicOwner => ({
  entity_type: "organization",
  legal_name: "Công ty TNHH Ví Dụ",
  ...extra,
});

const badge = (extra: Partial<PublicBadge> = {}): PublicBadge => ({
  website_id: "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e11",
  domain: "shop.example",
  kind: "sales",
  status: "notified",
  color: "blue",
  link_url: "https://online.gov.vn/Home/WebDetails/1",
  image_url: "https://online.gov.vn/Content/EndUser/LogoCCDVSaleNoti/logoSaleNoti.png",
  alt: "Đã thông báo Bộ Công Thương",
  snippet: "<a></a>",
  ...extra,
});

describe("hồ sơ chủ website ở chân trang", () => {
  it("không có hồ sơ hay tên pháp lý rỗng: không in gì (không chữ giữ chỗ)", () => {
    expect(ownerView(null, "vi")).toBeNull();
    expect(ownerView(owner({ legal_name: "  " }), "vi")).toBeNull();
  });

  it("chỉ in ô có dữ liệu, theo thứ tự luật yêu cầu", () => {
    const view = ownerView(
      owner({
        trade_name: "Ví Dụ Shop",
        tax_code: "0101234567",
        address: {
          country: "VN",
          province_code: "01",
          province_name: "Hà Nội",
          commune_code: "00004",
          commune_name: "Phường Ba Đình",
          line: "12 Phố Mẫu",
        },
        phone: "",
        email: "hotro@example.com",
        representative_name: null,
      }),
      "vi",
    );
    expect(view?.name).toBe("Công ty TNHH Ví Dụ (Ví Dụ Shop)");
    expect(view?.facts.map((f) => f.key)).toEqual(["taxCode", "address", "email"]);
    expect(view?.facts[1]?.values.value).toBe("12 Phố Mẫu, Phường Ba Đình, Hà Nội");
  });

  it("số đăng ký: in ngày và nơi cấp khi có; trùng mã số thuế mà thiếu ngày thì không lặp", () => {
    const full = ownerView(
      owner({
        tax_code: "0101234567",
        registration_number: "0101234567",
        registration_issued_on: "2020-03-05",
        registration_issued_by: "Sở Kế hoạch và Đầu tư Hà Nội",
      }),
      "vi",
    );
    expect(full?.facts[1]).toEqual({
      key: "registrationIssued",
      values: { value: "0101234567", date: "05/03/2020", by: "Sở Kế hoạch và Đầu tư Hà Nội" },
    });
    const same = ownerView(owner({ tax_code: "1", registration_number: "1" }), "vi");
    expect(same?.facts.map((f) => f.key)).toEqual(["taxCode"]);
    const household = ownerView(owner({ registration_number: "01A8001234" }), "vi");
    expect(household?.facts.map((f) => f.key)).toEqual(["registration"]);
  });

  it("địa chỉ trống thì chuỗi rỗng", () => {
    expect(formatAddress(null)).toBe("");
  });
});

describe("logo Bộ Công Thương", () => {
  it("chỉ hiện khi đã thông báo / đăng ký và địa chỉ là https", () => {
    expect(badgeView(badge())?.alt).toBe("Đã thông báo Bộ Công Thương");
    expect(badgeView(badge({ status: "registered" }))).not.toBeNull();
    expect(badgeView(badge({ status: "pending" }))).toBeNull();
    expect(badgeView(badge({ link_url: "javascript:alert(1)" }))).toBeNull();
    expect(badgeView(badge({ image_url: "http://online.gov.vn/logo.png" }))).toBeNull();
    expect(badgeView(null)).toBeNull();
  });
});
