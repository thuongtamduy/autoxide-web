import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupportAccess, resetSampleOrg, setSupportAccess } from "./org";
import {
  createGrant,
  createProvisioning,
  getDryRuns,
  getTenant,
  listGrants,
  listPlacements,
  listProvisionings,
  migratePlacements,
  moveTenant,
  requestExport,
  retryProvisioning,
  revokeGrant,
  setTenantStatus,
  syncPlatform,
} from "./platform";
import {
  PLACEMENT_IDS,
  PLAN_IDS,
  resetSamplePlatform,
  SAMPLE_STEP_MS,
  SAMPLE_TENANT_ID,
  STAFF,
  SUPPORT_ROLES,
  TENANT_IDS,
} from "./platform-data";
import {
  addPrice,
  assignPlan,
  cancelSubscription,
  createPlan,
  deactivatePrice,
  getTenantSubscription,
  listPeriods,
  listPlans,
  markPaid,
  missingDependency,
  moduleAccess,
  nearestLimit,
  removeOverride,
  setOverride,
  setPlanStatus,
  setReadOnly,
} from "./platform-plans";
import { getSubscription, resetSampleSettings } from "./settings";

const START = Date.parse("2026-11-15T03:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  resetSamplePlatform(START);
  resetSampleOrg();
  resetSampleSettings();
});

afterEach(() => {
  vi.useRealTimers();
});

function later(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

const input = {
  tenant_name: "Trà Hoa Sen",
  slug: "tra-hoa-sen",
  business_model: "single_store",
  plan_id: PLAN_IDS.starter,
  placement: "plan",
  admin_email: "chu@example.com",
  sample_data: true,
  parent_tenant_id: "",
};

describe("cấp phát khách mới", () => {
  it("gom mọi lỗi của ô một lần: thiếu, sai dạng, trùng tên rút gọn", async () => {
    const outcome = await createProvisioning({
      ...input,
      tenant_name: " ",
      slug: "bep-moc",
      plan_id: PLAN_IDS.starter2025,
      admin_email: "khong-phai-email",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.errors?.map((e) => [e.field, e.code])).toEqual([
      ["tenant_name", "required"],
      ["slug", "taken"],
      ["plan_id", "unknown"],
      ["admin_email", "email"],
    ]);
  });

  it("chạy từng bước theo thời gian; tạo khách ngay, gán gói dùng thử, xong thì khách hoạt động", async () => {
    const outcome = await createProvisioning(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const tenant = await getTenant(outcome.data.tenant_id);
    expect(tenant?.data.status).toBe("provisioning");
    later(3 * SAMPLE_STEP_MS);
    syncPlatform();
    const mid = (await listProvisionings()).data.find((p) => p.id === outcome.data.id);
    expect(mid?.step).toBe("migrated");
    later(5 * SAMPLE_STEP_MS);
    syncPlatform();
    const done = (await listProvisionings()).data.find((p) => p.id === outcome.data.id);
    expect(done?.status).toBe("done");
    expect((await getTenant(outcome.data.tenant_id))?.data.status).toBe("active");
    expect((await getTenantSubscription(outcome.data.tenant_id))?.status).toBe("trialing");
  });

  it("database riêng dừng ở bước chuẩn bị database; thử lại thì chạy tiếp, không tạo khách thứ hai", async () => {
    const outcome = await createProvisioning({ ...input, placement: "dedicated" });
    if (!outcome.ok) throw new Error("expected ok");
    later(3 * SAMPLE_STEP_MS);
    syncPlatform();
    const stopped = (await listProvisionings({ status: "failed" })).data.find(
      (p) => p.id === outcome.data.id,
    );
    expect(stopped?.step).toBe("tenant_created");
    expect(stopped?.last_error).toContain("database_ready");
    expect((await retryProvisioning(outcome.data.id)).ok).toBe(true);
    expect((await retryProvisioning(outcome.data.id)).ok).toBe(false);
    later(10 * SAMPLE_STEP_MS);
    syncPlatform();
    const done = (await listProvisionings({ status: "done" })).data.find(
      (p) => p.id === outcome.data.id,
    );
    expect(done).toBeDefined();
    const tenant = await getTenant(outcome.data.tenant_id);
    const placement = (await listPlacements()).data.find((p) => p.id === tenant?.data.placement_id);
    expect(placement).toMatchObject({ kind: "dedicated", name: "tra-hoa-sen" });
  });
});

describe("migration và dời khách: luôn chạy thử trước", () => {
  it("migrate thật bị chặn khi chưa chạy thử; chạy thử không đổi gì; chạy thật xong thì đủ migration", async () => {
    const blocked = await migratePlacements({ placement_id: PLACEMENT_IDS.pool2, dry_run: false });
    expect(blocked.ok || blocked.problem.code).toBe("kernel_dry_run_required");
    const plan = await migratePlacements({ placement_id: PLACEMENT_IDS.pool2, dry_run: true });
    expect(plan.ok && plan.data.placements[0]?.migrations).toEqual(["catalog m0007"]);
    expect(
      (await listPlacements()).data.find((p) => p.id === PLACEMENT_IDS.pool2)?.schema_state,
    ).toBe("behind");
    expect(
      (await migratePlacements({ placement_id: PLACEMENT_IDS.pool2, dry_run: false })).ok,
    ).toBe(true);
    expect(
      (await listPlacements()).data.find((p) => p.id === PLACEMENT_IDS.pool2)?.schema_state,
    ).toBe("migrating");
    later(2 * SAMPLE_STEP_MS);
    const ready = (await listPlacements()).data.find((p) => p.id === PLACEMENT_IDS.pool2);
    expect(ready).toMatchObject({ schema_state: "ready", pending_migrations: [] });
  });

  it("cả đội cần gõ đúng chữ xác nhận; lần chạy thử hết hiệu lực sau 30 phút", async () => {
    expect((await migratePlacements({ dry_run: true })).ok).toBe(true);
    const wrong = await migratePlacements({ dry_run: false, confirm: "mi" });
    expect(!wrong.ok && wrong.problem.errors?.[0]?.code).toBe("confirm_text");
    later(31 * 60_000);
    expect((await getDryRuns()).data.fleet).toBeNull();
    const stale = await migratePlacements({ dry_run: false, confirm: "migrate" });
    expect(!stale.ok && stale.problem.code).toBe("kernel_dry_run_required");
  });

  it("dời khách sang database riêng: chạy thử ghi kế hoạch, chạy thật thì khách đang dời rồi xong", async () => {
    const same = await moveTenant(TENANT_IDS.traSen, { to: PLACEMENT_IDS.pool1, dry_run: true });
    expect(!same.ok && same.problem.errors?.[0]?.code).toBe("same_placement");
    const plan = await moveTenant(TENANT_IDS.traSen, { to: "dedicated", dry_run: true });
    expect(plan.ok && plan.data.to).toBe("tra-sen");
    expect((await moveTenant(TENANT_IDS.traSen, { to: "", dry_run: false })).ok).toBe(true);
    expect((await getTenant(TENANT_IDS.traSen))?.data.status).toBe("moving");
    later(2 * SAMPLE_STEP_MS);
    const moved = await getTenant(TENANT_IDS.traSen);
    expect(moved?.data.status).toBe("active");
    expect(moved?.data.placement_id).not.toBe(PLACEMENT_IDS.pool1);
  });
});

describe("tạm khoá, xuất dữ liệu", () => {
  it("tạm khoá cần lý do; khách nền tảng không tạm khoá được; mở lại được", async () => {
    const short = await setTenantStatus(TENANT_IDS.traSen, "suspended", "ngắn");
    expect(!short.ok && short.problem.errors?.[0]?.code).toBe("length_10_500");
    const platform = (await getTenant("00000000-0000-7000-8000-000000000001"))?.data;
    expect(platform?.is_platform).toBe(true);
    const own = await setTenantStatus(
      platform?.id ?? "",
      "suspended",
      "Vi phạm điều khoản sử dụng",
    );
    expect(!own.ok && own.problem.code).toBe("tenant_platform_immutable");
    expect(
      (await setTenantStatus(TENANT_IDS.traSen, "suspended", "Vi phạm điều khoản sử dụng")).ok,
    ).toBe(true);
    expect((await setTenantStatus(TENANT_IDS.traSen, "active", "")).ok).toBe(true);
  });

  it("một lần xuất mỗi lúc; xong sau vài bước", async () => {
    expect((await requestExport(TENANT_IDS.anhMay, "Khách xin bản sao dữ liệu")).ok).toBe(true);
    const again = await requestExport(TENANT_IDS.anhMay, "Khách xin bản sao dữ liệu");
    expect(!again.ok && again.problem.code).toBe("tenant_export_running");
    later(3 * SAMPLE_STEP_MS);
    syncPlatform();
    expect((await requestExport(TENANT_IDS.anhMay, "Khách xin thêm một bản")).ok).toBe(true);
  });
});

describe("quyền vào hỗ trợ", () => {
  const grant = {
    tenant_id: SAMPLE_TENANT_ID,
    staff_user_id: STAFF.huy.id,
    role_id: (SUPPORT_ROLES[0] as { id: string }).id,
    basis: "support",
    reason: "Khách báo lỗi nhập CSV, phiếu #2001",
    legal_reference: "",
    hours: "4",
  };

  it("cấp vào Bếp Mộc ghi vào sổ của khách (khách thấy); thu hồi được", async () => {
    const outcome = await createGrant(grant);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const tenantSide = (await getSupportAccess()).data.grants;
    expect(tenantSide[0]).toMatchObject({ id: outcome.data.id, reason: grant.reason });
    expect(
      (await listGrants({ tenant_id: SAMPLE_TENANT_ID, status: "active" })).data.map((g) => g.id),
    ).toContain(outcome.data.id);
    expect((await revokeGrant(outcome.data.id)).ok).toBe(true);
    expect((await getSupportAccess()).data.grants[0]?.revoked_at).not.toBeNull();
  });

  it("tối đa 8 giờ, lý do 10–500 ký tự, yêu cầu của cơ quan cần số văn bản", async () => {
    const outcome = await createGrant({
      ...grant,
      hours: "9",
      reason: "ngắn",
      basis: "legal_request",
    });
    expect(!outcome.ok && outcome.problem.errors?.map((e) => e.field)).toEqual([
      "reason",
      "legal_reference",
      "hours",
    ]);
  });

  it("khách tắt hỗ trợ: chỉ cấp được theo yêu cầu của cơ quan", async () => {
    await setSupportAccess(false);
    const support = await createGrant(grant);
    expect(!support.ok && support.problem.code).toBe("auth.support_access_disabled");
    const legal = await createGrant({
      ...grant,
      basis: "legal_request",
      legal_reference: "[SỐ VĂN BẢN MẪU]",
    });
    expect(legal.ok).toBe(true);
  });
});

describe("gói, giá, thuê bao, ghi đè", () => {
  it("gói Doanh nghiệp và Khởi đầu dùng chung id, giá với màn Cài đặt của khách", async () => {
    const { data: tenantSide } = await getSubscription();
    const plans = (await listPlans()).data;
    const business = plans.find((p) => p.id === tenantSide.plan.id);
    expect(business?.prices.map((p) => p.id)).toContain(tenantSide.price.id);
  });

  it("module cần module khác trong cùng gói", async () => {
    expect(missingDependency(["marketplace", "catalog"])).toEqual({
      module: "marketplace",
      requires: "orders",
    });
    const outcome = await createPlan({
      code: "san-nho",
      name: "Sàn nhỏ",
      description: "",
      kind: "base",
      modules: "marketplace, catalog",
      trial_days: "14",
      placement: "shared",
    });
    expect(!outcome.ok && outcome.problem.code).toBe("plans.module_dependency_missing");
  });

  it("gói mới là bản nháp; cần giá mới bán được; không tắt được giá cuối của gói đang bán", async () => {
    const created = await createPlan({
      code: "khoi-dau-2027",
      name: "Khởi đầu 2027",
      description: "",
      kind: "base",
      modules: "content, catalog, orders",
      trial_days: "7",
      placement: "shared",
    });
    if (!created.ok) throw new Error("expected ok");
    expect(created.data.status).toBe("draft");
    const noPrice = await setPlanStatus(created.data.id, "active");
    expect(!noPrice.ok && noPrice.problem.code).toBe("plans.plan_without_price");
    const badPrice = await addPrice(created.data.id, { interval: "month", amount: "0" });
    expect(!badPrice.ok && badPrice.problem.errors?.[0]?.code).toBe("money_vnd");
    const price = await addPrice(created.data.id, { interval: "month", amount: "1.090.000" });
    expect(price.ok && price.data.amount_minor).toBe(1_090_000);
    expect((await setPlanStatus(created.data.id, "active")).ok).toBe(true);
    const last = await deactivatePrice(price.ok ? price.data.id : "");
    expect(!last.ok && last.problem.code).toBe("plans.price_last_active");
  });

  it("đánh dấu đã thu đưa thuê bao quá hạn về đang dùng; ngày nhận tiền không ở tương lai", async () => {
    const open = (await listPeriods({ tenant_id: TENANT_IDS.mocHung, status: "open" })).data[0];
    if (!open) throw new Error("expected an open period");
    const future = await markPaid(open.id, {
      provider_reference: "FT26319",
      paid_at: "2027-01-01",
    });
    expect(!future.ok && future.problem.errors?.[0]?.code).toBe("future_date");
    expect(
      (await markPaid(open.id, { provider_reference: "FT26319", paid_at: "2026-11-14" })).ok,
    ).toBe(true);
    expect((await getTenantSubscription(TENANT_IDS.mocHung))?.status).toBe("active");
  });

  it("chỉ đọc và huỷ của Bếp Mộc đổi đúng thuê bao khách thấy ở Cài đặt", async () => {
    expect((await setReadOnly(SAMPLE_TENANT_ID, true)).ok).toBe(true);
    expect((await getSubscription()).data.status).toBe("suspended");
    expect((await setReadOnly(SAMPLE_TENANT_ID, false)).ok).toBe(true);
    expect((await cancelSubscription(SAMPLE_TENANT_ID)).ok).toBe(true);
    expect((await getSubscription()).data.status).toBe("canceled");
  });

  it("gán gói cần gõ đúng tên khách", async () => {
    const pro = (await listPlans()).data.find((p) => p.id === PLAN_IDS.pro);
    const priceId = pro?.prices[0]?.id ?? "";
    const wrong = await assignPlan(TENANT_IDS.traSen, {
      price_id: priceId,
      confirm: "Tra Sen",
      tenant_name: "Trà Sen",
    });
    expect(!wrong.ok && wrong.problem.errors?.[0]?.code).toBe("confirm_text");
    const ok = await assignPlan(TENANT_IDS.traSen, {
      price_id: priceId,
      confirm: "Trà Sen",
      tenant_name: "Trà Sen",
    });
    expect(ok.ok && ok.data.plan_id).toBe(PLAN_IDS.pro);
  });

  it("ghi đè bật module ngoài gói; bỏ ghi đè thì về đúng gói", async () => {
    const outcome = await setOverride({
      tenant_id: TENANT_IDS.soTayBep,
      kind: "module",
      key: "catalog",
      value: "on",
      expires_on: "",
      reason: "Thử bán sách nấu ăn một tháng",
    });
    if (!outcome.ok) throw new Error("expected ok");
    const on = (await moduleAccess(TENANT_IDS.soTayBep)).data.find((m) => m.module === "catalog");
    expect(on).toMatchObject({ in_plan: false, enabled: true });
    await removeOverride(outcome.data.id);
    const off = (await moduleAccess(TENANT_IDS.soTayBep)).data.find((m) => m.module === "catalog");
    expect(off).toMatchObject({ enabled: false, override: null });
    const bad = await setOverride({
      tenant_id: TENANT_IDS.soTayBep,
      kind: "limit",
      key: "catalog.nope",
      value: "nhiều",
      expires_on: "2020-01-01",
      reason: "ngắn",
    });
    expect(!bad.ok && bad.problem.errors?.map((e) => e.code)).toEqual([
      "unknown_key",
      "whole_number",
      "past_date",
      "length_10_500",
    ]);
  });

  it("hạn mức gần nhất bỏ qua hạn mức không giới hạn", () => {
    expect(
      nearestLimit([
        { key: "a", unit: "count", used: 99, max: null, over_limit: false },
        { key: "b", unit: "count", used: 5, max: 10, over_limit: false },
        { key: "c", unit: "count", used: 9, max: 10, over_limit: false },
      ])?.key,
    ).toBe("c");
  });
});
