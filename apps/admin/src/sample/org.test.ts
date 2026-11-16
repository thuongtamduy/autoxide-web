import { afterEach, describe, expect, it } from "vitest";
import { samplePage } from "./index";
import {
  createDelegation,
  createInvitation,
  delegationStatus,
  getSupportAccess,
  grantStatus,
  invitationStatus,
  listDelegations,
  listInvitations,
  listProfiles,
  listUnits,
  resendInvitation,
  resetSampleOrg,
  revokeDelegation,
  revokeInvitation,
  revokeSupportGrant,
  SAMPLE_CHILD_TENANTS,
  setSupportAccess,
  updateProfile,
} from "./org";

afterEach(resetSampleOrg);

/** Giá trị phải có; không có thì test hỏng với câu rõ ràng. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing value");
  return value;
}

describe("samplePage", () => {
  const items = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

  it("cắt trang theo con trỏ như fetch_page của core", () => {
    const first = samplePage(items, { limit: 2 });
    expect(first.data.map((i) => i.id)).toEqual(["a", "b"]);
    expect(first.pagination).toEqual({ limit: 2, next_cursor: "b" });
    const last = samplePage(items, { limit: 2, cursor: "d" });
    expect(last.data.map((i) => i.id)).toEqual(["e"]);
    expect(last.pagination.next_cursor).toBeNull();
  });
});

describe("lời mời mẫu", () => {
  it("lọc theo trạng thái; lời mời chờ đã quá hạn tính là hết hạn", async () => {
    const expired = await listInvitations({ status: "expired" });
    expect(expired.data.map((i) => i.email)).toEqual(["tuan.cg@example.com"]);
    const pending = await listInvitations({ status: "pending" });
    expect(pending.data).toHaveLength(2);
    expect(invitationStatus({ ...must(pending.data[0]), expires_at: "2000-01-01T00:00:00Z" })).toBe(
      "expired",
    );
  });

  it("tạo: gom mọi lỗi một lần; đúng thì vào đầu danh sách, hạn 7 ngày", async () => {
    const bad = await createInvitation({ email: "x", org_id: "nope", role_ids: [], roles: [] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.problem.code).toBe("validation_failed");
      expect(bad.problem.errors?.map((e) => e.field)).toEqual(["email", "org_id", "role_ids"]);
    }
    const { data: units } = await listUnits();
    const made = await createInvitation({
      email: " New@Example.com ",
      org_id: must(units[2]).id,
      role_ids: ["r1"],
      roles: [{ id: "r1", name: "editor" }],
    });
    expect(made.ok).toBe(true);
    const page = await listInvitations();
    expect(page.data[0]?.email).toBe("new@example.com");
    const days = (Date.parse(must(page.data[0]).expires_at) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it("gửi lại gia hạn; thu hồi chỉ lời mời đang chờ", async () => {
    const { data } = await listInvitations({ status: "expired" });
    const expired = must(data[0]);
    expect((await resendInvitation(expired.id)).ok).toBe(true);
    expect((await listInvitations({ status: "pending" })).data).toHaveLength(3);
    expect((await revokeInvitation(expired.id)).ok).toBe(true);
    const again = await revokeInvitation(expired.id);
    expect(again.ok ? "" : again.problem.code).toBe("auth.invitation_invalid");
    const missing = await resendInvitation("nope");
    expect(missing.ok ? "" : missing.problem.code).toBe("auth.invitation_not_found");
  });
});

describe("uỷ quyền mẫu", () => {
  it("trạng thái: còn hiệu lực, hết hạn, đã thu hồi", async () => {
    const { data } = await listDelegations();
    expect(data.map((d) => delegationStatus(d))).toEqual(["active", "active", "expired"]);
    expect((await revokeDelegation(must(data[0]).id)).ok).toBe(true);
    expect(delegationStatus(must((await listDelegations()).data[0]))).toBe("revoked");
    const twice = await revokeDelegation(must(data[0]).id);
    expect(twice.ok ? "" : twice.problem.code).toBe("auth.delegation_not_active");
  });

  it("lý do 10–500 ký tự, hạn ở tương lai", async () => {
    const child = must(SAMPLE_CHILD_TENANTS[0]).id;
    const role = { id: "r", name: "accountant" };
    const bad = await createDelegation({
      child_tenant_id: child,
      role,
      reason: "ngắn",
      expires_at: "2000-01-01T00:00:00Z",
    });
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => e.field)).toEqual(["reason", "expires_at"]);
    const good = await createDelegation({
      child_tenant_id: child,
      role,
      reason: "Đối soát doanh thu tháng",
      expires_at: null,
    });
    expect(good.ok).toBe(true);
  });
});

describe("hồ sơ công khai mẫu", () => {
  it("mọi nút trừ gốc có hồ sơ; công khai thì cần đủ địa chỉ", async () => {
    const { data } = await listProfiles();
    // Trụ sở là gốc; sàn và người bán không có hồ sơ cửa hàng (bước 46).
    expect(data).toHaveLength(6);
    const warehouse = must(data.find((p) => !p.public));
    const input = {
      public: true,
      display_name: "Kho",
      province_code: "",
      commune_name: "",
      line: "",
      opens: "8:00",
      closes: "",
      pickup: false,
    };
    const bad = await updateProfile(warehouse.unit_id, input);
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => e.field)).toEqual([
      "province_code",
      "commune_name",
      "line",
      "opens",
    ]);
    const good = await updateProfile(warehouse.unit_id, {
      ...input,
      province_code: "79",
      commune_name: "Phường Thủ Đức",
      line: "[Địa chỉ mẫu]",
      opens: "08:00",
      closes: "17:00",
    });
    expect(good.ok && good.data.address?.province_name).toBe("TP. Hồ Chí Minh");
    expect(good.ok && good.data.hours).toHaveLength(7);
  });
});

describe("quyền vào hỗ trợ mẫu", () => {
  it("tắt / bật cài đặt; thu hồi lần cấp còn hạn", async () => {
    expect((await setSupportAccess(false)).ok).toBe(true);
    const { data } = await getSupportAccess();
    expect(data.enabled).toBe(false);
    const active = must(data.grants.find((g) => grantStatus(g) === "active"));
    expect((await revokeSupportGrant(active.id)).ok).toBe(true);
    const after = must((await getSupportAccess()).data.grants.find((g) => g.id === active.id));
    expect(grantStatus(after)).toBe("revoked");
  });
});
