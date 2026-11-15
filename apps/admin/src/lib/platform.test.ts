import { describe, expect, it } from "vitest";
import type { Tenant } from "@/sample/platform-data";
import {
  daysUntil,
  MAIN_PLACEMENT_ID,
  matchesFilter,
  mergePlacements,
  mergeTenants,
  needsAttention,
  orderTree,
  roughAge,
  type TenantRow,
} from "./platform";

const tenant = (id: string, name: string, parent_id: string | null = null): Tenant => ({
  id,
  slug: id,
  name,
  status: "active",
  parent_id,
  placement_id: "p",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_platform: false,
  business_model: "single_store",
  primary_domain: null,
  status_reason: null,
});

describe("ghép khách và placement của core với dữ liệu mẫu", () => {
  const core = {
    id: "00000000-0000-7000-8000-000000000001",
    slug: "default",
    name: "Platform",
    status: "active",
    placement: "main",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };
  const main = {
    id: MAIN_PLACEMENT_ID,
    name: "main",
    kind: "shared",
    backend: "sqlite",
    schema_state: "ready",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("khách của core trước, khách chỉ có trong mẫu sau; trường mới lấy từ mẫu cùng id", () => {
    const sample = [
      { ...tenant(core.id, "Mẫu nền tảng"), business_model: null, primary_domain: "x.example" },
      tenant("s", "Khách mẫu"),
    ];
    const merged = mergeTenants([core], [main], sample);
    expect(merged.map((x) => [x.id, x.source])).toEqual([
      [core.id, "core"],
      ["s", "sample"],
    ]);
    expect(merged[0]).toMatchObject({
      name: "Platform",
      placement_id: MAIN_PLACEMENT_ID,
      is_platform: true,
      primary_domain: "x.example",
    });
  });

  it("tắt dữ liệu mẫu: chỉ dữ liệu của core, trường mới để trống", () => {
    const [only] = mergeTenants([core], [main], null);
    expect(only).toMatchObject({ source: "core", business_model: null, primary_domain: null });
    const placements = mergePlacements([main], null);
    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({ control: true, location: "", pending_migrations: [] });
  });
});

describe("sổ khách hàng", () => {
  it("xếp cây: khách con đứng ngay sau khách cha, theo tên", () => {
    const list = [
      tenant("b", "Bếp Mộc"),
      tenant("n2", "Nhà Sách Gió Huế", "n"),
      tenant("n", "Nhà Sách Gió"),
      tenant("n1", "Nhà Sách Gió Đà Lạt", "n"),
      tenant("x", "Khách lạc", "khong-co"),
    ];
    expect(orderTree(list).map(({ item, depth }) => `${item.id}:${depth}`)).toEqual([
      "b:0",
      "x:0",
      "n:0",
      "n1:1",
      "n2:1",
    ]);
  });

  it("lọc: database riêng, chờ migration, cần chú ý", () => {
    const row: TenantRow = {
      tenant: { ...tenant("a", "A"), source: "core" },
      placement: {
        id: "p",
        name: "pool-2",
        kind: "shared",
        backend: "postgres",
        schema_state: "behind",
        schema_checked_at: null,
        created_at: "",
        updated_at: "",
        pending_migrations: ["catalog m0007"],
        location: "Việt Nam",
        control: false,
      },
      subscription: null,
      plan: null,
      nearest: { key: "catalog.products", unit: "count", used: 90, max: 100, over_limit: false },
      children: 0,
    };
    expect(matchesFilter(row, "shared")).toBe(true);
    expect(matchesFilter(row, "dedicated")).toBe(false);
    expect(matchesFilter(row, "migration")).toBe(true);
    expect(needsAttention(row)).toBe(true);
    expect(
      needsAttention({
        ...row,
        nearest: { key: "catalog.products", unit: "count", used: 10, max: 100, over_limit: false },
      }),
    ).toBe(false);
  });

  it("đếm ngày còn lại và tuổi gần đúng", () => {
    const now = Date.parse("2026-11-15T00:00:00Z");
    expect(daysUntil("2026-11-24T12:00:00Z", now)).toBe(10);
    expect(daysUntil("2026-11-12T00:00:00Z", now)).toBe(-3);
    expect(roughAge(45)).toEqual({ unit: "seconds", count: 45 });
    expect(roughAge(240)).toEqual({ unit: "minutes", count: 4 });
    expect(roughAge(7 * 3600 + 58 * 60)).toEqual({ unit: "hours", count: 7 });
  });
});
