import { describe, expect, it } from "vitest";
import { asksForWorkspace, normalizeWorkspace, tenantHeaders } from "./tenant";

describe("normalizeWorkspace", () => {
  it("nhận slug và UUID, chữ hoa thành chữ thường", () => {
    expect(normalizeWorkspace("  Acme-Shop ")).toBe("acme-shop");
    expect(normalizeWorkspace("019A1E02-2D88-74BC-86C7-68B965B0B692")).toBe(
      "019a1e02-2d88-74bc-86c7-68b965b0b692",
    );
    expect(normalizeWorkspace("")).toBe("");
  });

  it("từ chối giá trị sai dạng", () => {
    expect(normalizeWorkspace("acme shop")).toBeNull();
    expect(normalizeWorkspace("-acme")).toBeNull();
    expect(normalizeWorkspace("a\nb")).toBeNull();
  });
});

describe("tenantHeaders", () => {
  it("biến môi trường đứng trước khách đã chọn và tên miền", () => {
    expect(tenantHeaders("acme", "other", "shop.example.com")).toEqual({
      "Autoxide-Tenant": "acme",
    });
  });

  it("khách đã chọn lúc đăng nhập đứng trước tên miền", () => {
    expect(tenantHeaders("", "Other", "shop.example.com")).toEqual({
      "Autoxide-Tenant": "other",
    });
  });

  it("không chọn gì thì chuyển tên miền hợp lệ, bỏ giá trị lạ", () => {
    expect(tenantHeaders("", undefined, "Shop.Example.com:3000")).toEqual({
      "X-Forwarded-Host": "shop.example.com:3000",
    });
    expect(tenantHeaders("", "bad value", "a b")).toEqual({});
    expect(tenantHeaders("", undefined, null)).toEqual({});
  });

  it("chỉ hỏi khách khi core báo thiếu hay không thấy khách", () => {
    expect(asksForWorkspace("tenant_required")).toBe(true);
    expect(asksForWorkspace("tenant_not_found")).toBe(true);
    expect(asksForWorkspace("auth.invalid_credentials")).toBe(false);
    expect(asksForWorkspace(undefined)).toBe(false);
  });
});
