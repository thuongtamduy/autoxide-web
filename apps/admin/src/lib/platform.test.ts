import { describe, expect, it } from "vitest";
import type { Placement, Tenant } from "@/sample/platform-data";
import {
  coreTenantFilter,
  daysUntil,
  MAIN_PLACEMENT_ID,
  matchesQuery,
  mergePlacements,
  mergeTenants,
  moveFinished,
  moveSteps,
  moveTargets,
  needsAttention,
  orderTree,
  parseTenantQuery,
  roughAge,
  sameQuery,
  type TenantRow,
  tenantQueryHref,
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

  it("placement đi kèm sổ khách (`expand=placement`), cờ chỉ đọc của core; khách mẫu ghi được", () => {
    const eu = { ...main, id: "p-eu", name: "eu-db", kind: "dedicated", schema_state: "behind" };
    const [own, other] = mergeTenants(
      [{ ...core, placement: "eu-db", read_only: true, expanded: { placement: eu } }],
      // Danh sách placement không có `eu-db`: placement lấy từ `expanded`, không tra theo tên.
      [main],
      [tenant("s", "Khách mẫu")],
      [
        {
          ...fromSample(eu),
          location: "Frankfurt",
        },
      ],
    );
    expect(own).toMatchObject({ read_only: true, placement_id: "p-eu" });
    expect(own?.placement).toMatchObject({
      name: "eu-db",
      kind: "dedicated",
      schema_state: "behind",
      location: "Frankfurt",
      source: "core",
    });
    expect(other).toMatchObject({ source: "sample", read_only: false, placement: null });
    // Không có `expanded` (đọc một khách lẻ): tra theo tên, `placement` để trống.
    const [plain] = mergeTenants([core], [main], null);
    expect(plain).toMatchObject({
      read_only: false,
      placement_id: MAIN_PLACEMENT_ID,
      placement: null,
    });
  });

  it("tắt dữ liệu mẫu: chỉ dữ liệu của core, trường mới để trống", () => {
    const [only] = mergeTenants([core], [main], null);
    expect(only).toMatchObject({ source: "core", business_model: null, primary_domain: null });
    const placements = mergePlacements([main], null);
    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({ control: true, location: "", pending_migrations: [] });
  });

  it("nơi lưu file của placement đi theo bản của core; không có thì `null`", () => {
    const storage = { kind: "s3", bucket: "b", credentials: true };
    const [own, plain] = mergePlacements(
      [
        { ...main, id: "p2", name: "eu-db", storage },
        { ...main, storage: null },
      ],
      null,
    );
    expect(own?.storage).toEqual(storage);
    expect(plain?.storage).toBeNull();
  });
});

/** Placement mẫu có cùng id với placement của core (trường mới để trống). */
function fromSample(p: { id: string; name: string }): Placement {
  return {
    id: p.id,
    name: p.name,
    kind: "dedicated",
    backend: "postgres",
    schema_state: "behind",
    schema_checked_at: null,
    created_at: "",
    updated_at: "",
    pending_migrations: [],
    location: "",
    control: false,
  };
}

describe("dời khách", () => {
  it("các bước của lượt dời: đã qua, đang ở, chưa tới; xong thì mọi bước đã qua", () => {
    expect(moveSteps("copied").map((s) => s.phase)).toEqual(["done", "current", "todo", "todo"]);
    expect(moveSteps("done").every((s) => s.phase === "done")).toBe(true);
    expect(moveSteps("aborted").some((s) => s.phase === "current")).toBe(false);
    expect(moveFinished("done") && moveFinished("aborted")).toBe(true);
    expect(moveFinished("switched")).toBe(false);
  });

  it("đích dời: placement của core trừ placement đang ở; placement mẫu không chọn được", () => {
    const list = [
      { name: "main", source: "core" as const },
      { name: "eu-db", source: "core" as const },
      { name: "pool-1", source: "sample" as const },
    ];
    expect(moveTargets(list, "main").map((p) => p.name)).toEqual(["eu-db"]);
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
      tenant: { ...tenant("a", "A"), source: "core", read_only: false, placement: null },
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
    expect(matchesQuery(row, { placement_kind: "shared" })).toBe(true);
    expect(matchesQuery(row, { placement_kind: "dedicated" })).toBe(false);
    expect(matchesQuery(row, { schema_state: "behind" })).toBe(true);
    expect(matchesQuery(row, { schema_state: "behind", read_only: true })).toBe(false);
    expect(matchesQuery(row, { read_only: false, attention: true })).toBe(true);
    expect(needsAttention(row)).toBe(true);
    expect(
      needsAttention({
        ...row,
        nearest: { key: "catalog.products", unit: "count", used: 10, max: 100, over_limit: false },
      }),
    ).toBe(false);
    // Khách chỉ đọc luôn cần để ý.
    expect(
      needsAttention({
        ...row,
        tenant: { ...row.tenant, read_only: true },
        nearest: null,
      }),
    ).toBe(true);
  });

  it("bộ lọc trên địa chỉ: đọc, bỏ giá trị lạ, phần gửi core, địa chỉ gọn", () => {
    const query = parseTenantQuery({
      read_only: "true",
      placement_kind: "dedicated",
      schema_state: "nope",
      attention: "true",
    });
    expect(query).toEqual({ read_only: true, placement_kind: "dedicated", attention: true });
    // "Cần để ý" ghép dữ liệu mẫu nên không gửi core.
    expect(coreTenantFilter(query)).toEqual({ read_only: true, placement_kind: "dedicated" });
    expect(coreTenantFilter(parseTenantQuery({ read_only: "false" }))).toEqual({
      read_only: false,
    });
    expect(coreTenantFilter({})).toEqual({});
    expect(tenantQueryHref(query)).toBe(
      "/platform?read_only=true&placement_kind=dedicated&attention=true",
    );
    expect(tenantQueryHref(parseTenantQuery({ read_only: "false" }))).toBe(
      "/platform?read_only=false",
    );
    expect(tenantQueryHref({})).toBe("/platform");
    expect(
      sameQuery({ schema_state: "behind" }, parseTenantQuery({ schema_state: "behind" })),
    ).toBe(true);
    expect(sameQuery({}, { attention: true })).toBe(false);
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
