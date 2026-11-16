import { describe, expect, it } from "vitest";
import { tenantHeaders } from "./tenant";

describe("khách của website khi core chạy nhiều khách", () => {
  it("đặt AUTOXIDE_STOREFRONT_TENANT thì gửi Autoxide-Tenant, bỏ qua tên miền", () => {
    expect(tenantHeaders("bep-moc", "shop.example.com")).toEqual({ "Autoxide-Tenant": "bep-moc" });
  });

  it("không đặt thì chuyển tên miền người đọc đang mở", () => {
    expect(tenantHeaders("", "Shop.Example.com:443")).toEqual({
      "X-Forwarded-Host": "shop.example.com:443",
    });
  });

  it("tên miền lạ hay không có thì không gửi gì", () => {
    expect(tenantHeaders("", "evil.com\r\nX-Injected: 1")).toEqual({});
    expect(tenantHeaders("", null)).toEqual({});
  });
});
