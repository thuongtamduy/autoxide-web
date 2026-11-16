import { describe, expect, it } from "vitest";
import { groupPermissions, matchesPermission, moduleOf, notableRisk } from "./permission-groups";

const CATALOG = [
  { name: "notes.write", description: "Write notes." },
  { name: "auth.roles.read", description: "See roles." },
  { name: "auth.users.read", description: "Xem tài khoản người dùng." },
  { name: "auth.roles.manage", description: "Change roles." },
];

describe("permission theo module", () => {
  it("module là phần trước dấu chấm đầu tiên", () => {
    expect(moduleOf("auth.roles.read")).toBe("auth");
    expect(moduleOf("plain")).toBe("plain");
  });

  it("nhóm và xếp theo tên; permission role giữ mà sổ không còn vẫn hiện", () => {
    const groups = groupPermissions(CATALOG, ["auth.roles.read", "gone.thing"]);
    expect(groups.map((g) => g.module)).toEqual(["auth", "gone", "notes"]);
    expect(groups[0]?.permissions.map((p) => p.name)).toEqual([
      "auth.roles.manage",
      "auth.roles.read",
      "auth.users.read",
    ]);
    expect(groups[1]?.permissions).toEqual([{ name: "gone.thing", description: "" }]);
  });

  it("tìm theo tên hay mô tả, không cần dấu", () => {
    const users = { name: "auth.users.read", description: "Xem tài khoản người dùng." };
    expect(matchesPermission(users, "tai khoan")).toBe(true);
    expect(matchesPermission(users, "USERS")).toBe(true);
    expect(matchesPermission(users, "roles")).toBe(false);
    expect(matchesPermission(users, "  ")).toBe(true);
  });
});

describe("mức rủi ro của permission", () => {
  it("chỉ nêu xoá, dữ liệu cá nhân và tiền", () => {
    expect(notableRisk({ name: "a.b", description: "", risk: "money" })).toBe("money");
    expect(notableRisk({ name: "a.b", description: "", risk: "write" })).toBeNull();
    expect(notableRisk({ name: "a.b", description: "" })).toBeNull();
  });
});
