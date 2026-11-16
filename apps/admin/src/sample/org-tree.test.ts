import { afterEach, describe, expect, it } from "vitest";
import { createUnit, listUnits, resetSampleOrg, SAMPLE_UNIT_IDS, setUnitStatus } from "./org";
import {
  clearSetting,
  effectiveSettings,
  listMemberships,
  requestSplit,
  resetSampleOrgTree,
  setSetting,
} from "./org-tree";

afterEach(() => {
  resetSampleOrg();
  resetSampleOrgTree();
});

const U = SAMPLE_UNIT_IDS;

describe("cây tổ chức mẫu", () => {
  it("thành viên theo độ sâu: người ở nút cha chỉ chảy xuống khi độ sâu là subtree / tenant", async () => {
    const direct = await listMemberships({ org_id: U.q3 });
    expect(direct.data.map((m) => m.user.name)).toEqual(["Ngô Mai", "Trần Bình"]);
    const all = await listMemberships({ org_id: U.q3, include_inherited: true });
    const inherited = all.data.filter((m) => m.inherited).map((m) => m.user.name);
    // Minh Anh (editor, độ sâu "nút") ở Trụ sở không chảy xuống; Hoàng Nam (vùng) thì có.
    expect(inherited).toEqual(["Trương Đức Anh", "Lan Phạm", "Phạm Thu", "Hoàng Nam"]);
    expect(inherited).not.toContain("Minh Anh");
  });

  it("cài đặt lấy từ nút gần nhất có đặt; xoá giá trị riêng thì về kế thừa", async () => {
    const before = await effectiveSettings(U.q3);
    const timezone = before.ok ? before.data.find((s) => s.key === "organizations.timezone") : null;
    expect(timezone).toMatchObject({
      value: "Asia/Ho_Chi_Minh",
      source_unit_id: U.root,
      inherited: true,
    });
    const seller = await effectiveSettings(U.sellers[0] as string);
    expect(seller.ok && seller.data.find((s) => s.key === "tax.profile")?.value).toBe("per_seller");

    const bad = await setSetting(U.q3, "organizations.language", "fr");
    expect(bad.ok ? null : bad.problem.errors?.[0]?.field).toBe("value");
    expect((await setSetting(U.q3, "organizations.language", "en")).ok).toBe(true);
    const own = await effectiveSettings(U.q3);
    expect(own.ok && own.data.find((s) => s.key === "organizations.language")).toMatchObject({
      value: "en",
      inherited: false,
    });
    expect((await clearSetting(U.q3, "organizations.language")).ok).toBe(true);
    const back = await effectiveSettings(U.q3);
    expect(back.ok && back.data.find((s) => s.key === "organizations.language")?.value).toBe("vi");
  });

  it("thêm nút: gom lỗi theo ô; mã trùng; người không có quyền duyệt tạo nút chờ duyệt", async () => {
    const bad = await createUnit(
      { parent_id: U.q3, unit_type: "tenant", name: " ", code: "ch-q3" },
      { manage: true },
    );
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => `${e.field}:${e.code}`)).toEqual([
      "name:required",
      "unit_type:unknown",
      "code:taken",
    ]);
    const pending = await createUnit(
      { parent_id: U.q3, unit_type: "warehouse", name: "Kho Quận 3" },
      { manage: false },
    );
    expect(pending.ok && pending.data.status).toBe("pending");
    const made = await createUnit(
      { parent_id: U.q3, unit_type: "store", name: "Quầy Quận 3", code: "CH-Q3B" },
      { manage: true },
    );
    if (!made.ok) throw new Error("không tạo được nút");
    expect(made.data.status).toBe("active");
    // Hoàn tác = lưu trữ; gốc không đổi được trạng thái.
    expect((await setUnitStatus(made.data.id, "archived")).ok).toBe(true);
    const root = await setUnitStatus(U.root, "archived");
    expect(root.ok ? "" : root.problem.code).toBe("organizations.root_immutable");
    expect((await listUnits()).data.find((u) => u.id === made.data.id)?.status).toBe("archived");
  });

  it("yêu cầu tách: phải xác nhận; chỉ vùng / cửa hàng / sàn; không gửi trùng", async () => {
    const noAck = await requestSplit(U.q3, { acknowledged: false, note: "" });
    expect(noAck.ok ? "" : noAck.problem.errors?.[0]?.field).toBe("acknowledged");
    const warehouse = await requestSplit(U.warehouse, { acknowledged: true, note: "" });
    expect(warehouse.ok ? "" : warehouse.problem.code).toBe("organizations.split_not_allowed");
    expect((await requestSplit(U.q3, { acknowledged: true, note: "Tự quản" })).ok).toBe(true);
    const again = await requestSplit(U.q3, { acknowledged: true, note: "" });
    expect(again.ok ? "" : again.problem.code).toBe("organizations.split_request_exists");
  });
});
