import { describe, expect, it } from "vitest";
import {
  chainOf,
  groupMemberships,
  type MembershipRow,
  memberCounts,
  ordered,
  settingText,
  settingValue,
  typeLabel,
  type Unit,
  unitIdOf,
  widestScope,
} from "./org";

const ROOT = "00000000-0000-7000-8000-000000000001";
const A = "00000000-0000-7000-8000-00000000000a";
const B = "00000000-0000-7000-8000-00000000000b";
const C = "00000000-0000-7000-8000-00000000000c";

function unit(
  id: string,
  parent: string | null,
  name: string,
  at: string,
  status = "active",
): Unit {
  return {
    id,
    parent_id: parent,
    name,
    unit_type: parent ? "store" : "tenant",
    status: status as Unit["status"],
    created_at: at,
    updated_at: at,
  };
}

const UNITS = [
  unit(B, ROOT, "B", "2026-01-03T00:00:00Z"),
  unit(ROOT, null, "Root", "2026-01-01T00:00:00Z"),
  unit(A, ROOT, "A", "2026-01-02T00:00:00Z"),
  unit(C, A, "C", "2026-01-04T00:00:00Z"),
];

describe("cây tổ chức", () => {
  it("duyệt sâu từ gốc, con theo thứ tự tạo; bỏ nút lưu trữ", () => {
    expect(ordered(UNITS).map(({ unit, depth }) => `${unit.name}:${depth}`)).toEqual([
      "Root:0",
      "A:1",
      "C:2",
      "B:1",
    ]);
    const archived = [...UNITS, unit("x", ROOT, "X", "2026-01-05T00:00:00Z", "archived")];
    expect(ordered(archived).map(({ unit }) => unit.name)).not.toContain("X");
  });

  it("chỉ thấy một nhánh: nút có cha ngoài danh sách đứng như gốc", () => {
    const branch = UNITS.filter((u) => u.id === A || u.id === C);
    expect(ordered(branch).map(({ unit, depth }) => `${unit.name}:${depth}`)).toEqual([
      "A:0",
      "C:1",
    ]);
  });

  it("chuỗi từ nút lên gốc", () => {
    expect(chainOf(UNITS, C).map((u) => u.name)).toEqual(["C", "A", "Root"]);
    expect(chainOf(UNITS, "nope")).toEqual([]);
  });

  it("id nút: chỉ UUID", () => {
    expect(unitIdOf(` ${A.toUpperCase()} `)).toBe(A);
    expect(unitIdOf("../etc")).toBeNull();
    expect(unitIdOf(undefined)).toBeNull();
  });
});

describe("thành viên theo nút", () => {
  const row = (user: string, org: string, role: string, inherited = false): MembershipRow => ({
    id: `${user}${org}${role}`,
    user_id: user,
    org_id: org,
    role_id: role,
    role_name: role,
    inherited,
    created_at: "2026-01-01T00:00:00Z",
  });

  it("gom role của cùng người ở cùng nút; người gán trực tiếp đứng trước", () => {
    const rows = [row("u1", ROOT, "admin", true), row("u2", A, "editor"), row("u2", A, "viewer")];
    expect(groupMemberships(rows)).toEqual([
      {
        user_id: "u2",
        org_id: A,
        inherited: false,
        roles: [
          { id: "editor", name: "editor" },
          { id: "viewer", name: "viewer" },
        ],
      },
      { user_id: "u1", org_id: ROOT, inherited: true, roles: [{ id: "admin", name: "admin" }] },
    ]);
  });

  it("đếm người khác nhau ở mỗi nút", () => {
    const counts = memberCounts([row("u1", A, "r1"), row("u1", A, "r2"), row("u2", A, "r1")]);
    expect(counts.get(A)).toBe(2);
    expect(counts.get(B)).toBeUndefined();
  });

  it("độ sâu rộng nhất của role", () => {
    expect(widestScope({ all_permissions: true, permissions: [], grants: [] })).toBe("tenant");
    expect(widestScope({ all_permissions: false, permissions: ["a"], grants: [] })).toBe("tenant");
    expect(
      widestScope({
        all_permissions: false,
        permissions: [],
        grants: [{ scope: "unit" }, { scope: "subtree" }, { scope: "own" }],
      }),
    ).toBe("subtree");
    expect(widestScope({ all_permissions: false, permissions: [], grants: [] })).toBeNull();
  });
});

describe("giá trị cài đặt", () => {
  it("thành chữ để sửa", () => {
    expect(settingText("Asia/Ho_Chi_Minh")).toBe("Asia/Ho_Chi_Minh");
    expect(settingText(["vi", "en"])).toBe("vi, en");
    expect(settingText(null)).toBe("");
    expect(settingText(3)).toBe("3");
  });

  it("chữ thành giá trị theo dạng giá trị đang có", () => {
    expect(settingValue(" vi, en ,", ["en"])).toEqual(["vi", "en"]);
    expect(settingValue("", ["en"])).toEqual([]);
    // Chưa đặt (null) mà gõ danh sách: dấu phẩy, JSON, hay mặc định là danh sách.
    expect(settingValue("vi, en", null)).toEqual(["vi", "en"]);
    expect(settingValue('["vi"]', null)).toEqual(["vi"]);
    expect(settingValue("vi", null, ["en"])).toEqual(["vi"]);
    expect(settingValue(" VND ", null)).toBe("VND");
    expect(settingValue("true", false)).toBe(true);
    expect(settingValue("not json", 3)).toBe("not json");
  });
});

describe("tên loại nút", () => {
  const types = [
    { code: "tenant", name: "Tenant", description: "", created_at: "", updated_at: "" },
    { code: "store", name: "Cửa hàng", description: "", created_at: "", updated_at: "" },
  ];
  const translate = (code: string) => ({ tenant: "Trụ sở", region: "Vùng" })[code] ?? null;
  it("tên khách đặt; gốc và loại core không trả thì chữ giao diện; không có thì mã", () => {
    expect(typeLabel(types, "store", translate)).toBe("Cửa hàng");
    expect(typeLabel(types, "tenant", translate)).toBe("Trụ sở");
    expect(typeLabel(types, "region", translate)).toBe("Vùng");
    expect(typeLabel(types, "kiosk", translate)).toBe("kiosk");
  });
});
