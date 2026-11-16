import { describe, expect, it } from "vitest";
import { publicOrigin, tenantHeaders } from "./tenant";

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

describe("publicOrigin", () => {
  it("địa chỉ cố định luôn thắng, bỏ dấu / ở cuối", () => {
    expect(publicOrigin("https://www.example.com/", "other.example", "http", true)).toBe(
      "https://www.example.com",
    );
  });

  it("không đặt thì theo tên miền khách đang mở và giao thức proxy báo", () => {
    expect(publicOrigin("", "Shop.Example.com", "https", false)).toBe("https://shop.example.com");
    expect(publicOrigin("", "shop.example.com", "http, https", true)).toBe(
      "http://shop.example.com",
    );
  });

  it("proxy không báo giao thức: https khi chạy thật, http khi chạy thử", () => {
    expect(publicOrigin("", "shop.example.com", null, true)).toBe("https://shop.example.com");
    expect(publicOrigin("", "localhost:3300", null, false)).toBe("http://localhost:3300");
    expect(publicOrigin("", "shop.example.com", "gopher", true)).toBe("https://shop.example.com");
  });

  it("tên miền sai dạng hay không có thì về địa chỉ chạy thử", () => {
    expect(publicOrigin("", "evil.example/path", "https", true)).toBe("http://localhost:3000");
    expect(publicOrigin("", null, null, true)).toBe("http://localhost:3000");
  });
});
