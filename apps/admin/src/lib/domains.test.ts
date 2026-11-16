import { describe, expect, it } from "vitest";
import { canVerify, domainNext, explainSingleMode, pendingExpiresAt, sortDomains } from "./domains";

const at = "2026-11-10T08:00:00.000Z";

describe("tên miền của khách", () => {
  it("hạn của tên miền đang chờ là 7 ngày sau lần đổi trạng thái; trạng thái khác không có hạn", () => {
    expect(pendingExpiresAt({ status: "pending", updated_at: at })).toBe(
      "2026-11-17T08:00:00.000Z",
    );
    expect(pendingExpiresAt({ status: "verified", updated_at: at })).toBeNull();
    expect(pendingExpiresAt({ status: "pending", updated_at: "x" })).toBeNull();
  });

  it("việc cần làm theo trạng thái và số lần kiểm hằng ngày không thấy bản ghi", () => {
    expect(domainNext({ status: "pending", failed_checks: 0 })).toBe("set_record");
    expect(domainNext({ status: "failed", failed_checks: 0 })).toBe("fix_record");
    expect(domainNext({ status: "verified", failed_checks: 0 })).toBe("keep_record");
    expect(domainNext({ status: "verified", failed_checks: 2 })).toBe("restore_record");
    // Đã xác minh và bản ghi vẫn thấy: core không tra lại, nên không hiện nút "Kiểm tra ngay".
    expect(canVerify({ status: "verified", failed_checks: 0 })).toBe(false);
    expect(canVerify({ status: "verified", failed_checks: 1 })).toBe(true);
    expect(canVerify({ status: "pending", failed_checks: 0 })).toBe(true);
  });

  it("xếp: hỏng, sắp mất, đang chờ, rồi đã xác minh; cùng nhóm thì mới trước", () => {
    const d = (domain: string, status: string, failed_checks: number, created_at: string) => ({
      domain,
      status,
      failed_checks,
      created_at,
    });
    const sorted = sortDomains([
      d("ok.example", "verified", 0, "2026-11-01T00:00:00Z"),
      d("old.example", "pending", 0, "2026-11-01T00:00:00Z"),
      d("new.example", "pending", 0, "2026-11-05T00:00:00Z"),
      d("bad.example", "failed", 0, "2026-10-01T00:00:00Z"),
      d("lost.example", "verified", 1, "2026-10-01T00:00:00Z"),
    ]);
    expect(sorted.map((x) => x.domain)).toEqual([
      "bad.example",
      "lost.example",
      "new.example",
      "old.example",
      "ok.example",
    ]);
  });

  it("bản cài một khách (409 `tenant_single_mode`): lời giải thích thay câu của core, giữ `code`", () => {
    const refused = {
      code: "tenant_single_mode",
      error: "set AUTOXIDE_TENANCY_MODE=multi to add tenants",
    };
    expect(explainSingleMode(refused, "Point your domain at the server.")).toEqual({
      code: "tenant_single_mode",
      error: "Point your domain at the server.",
    });
    const other = { code: "tenant_domain_taken", error: "taken" };
    expect(explainSingleMode(other, "x")).toBe(other);
  });
});
