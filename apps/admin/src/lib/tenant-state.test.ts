import { ApiError } from "@autoxide/sdk";
import { describe, expect, it } from "vitest";
import { tenantBlock } from "./tenant-state";

const problem = (status: number, code: string) =>
  new ApiError(status, { type: "about:blank", title: "", status, code, detail: "…" });

describe("khách bị chặn toàn bộ", () => {
  it("nhận ra tạm khoá, bảo trì", () => {
    expect(tenantBlock(problem(403, "tenant_suspended"))).toBe("suspended");
    expect(tenantBlock(problem(503, "tenant_maintenance"))).toBe("maintenance");
  });

  it("chỉ đọc, thiếu quyền hay lỗi khác thì không", () => {
    expect(tenantBlock(problem(403, "tenant_read_only"))).toBeNull();
    expect(tenantBlock(problem(403, "permission_denied"))).toBeNull();
    // `tenant_moving` (409) chỉ ở vài lệnh của nhà vận hành, không chặn cả khung.
    expect(tenantBlock(problem(409, "tenant_moving"))).toBeNull();
    expect(tenantBlock(new Error("network"))).toBeNull();
  });
});
