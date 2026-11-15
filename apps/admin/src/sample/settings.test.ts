import { afterEach, describe, expect, it } from "vitest";
import {
  addDomain,
  cancelRenewal,
  changePlan,
  getSubscription,
  listBillingPeriods,
  listCatalog,
  listConnections,
  listDomains,
  listJobs,
  resetSampleSettings,
  resumeRenewal,
  retryJob,
  revokeDomain,
  saveConnection,
  testConnection,
  updateBillingProfile,
  usagePercent,
  verifyDomain,
} from "./settings";

afterEach(resetSampleSettings);

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing value");
  return value;
}

describe("gói và thuê bao mẫu", () => {
  it("lọc kỳ thanh toán theo trạng thái", async () => {
    expect((await listBillingPeriods()).data).toHaveLength(3);
    const open = await listBillingPeriods({ status: "open" });
    expect(open.data.map((p) => p.amount_minor)).toEqual([1_364_383]);
    expect(open.data[0]?.amount_currency).toBe("VND");
  });

  it("nâng gói có hiệu lực ngay, hạ gói chờ hết kỳ, cùng giá thì báo 409", async () => {
    const { data: catalog } = await listCatalog();
    const starter = must(catalog.find((p) => p.code === "starter"));
    const business = must(catalog.find((p) => p.code === "business"));
    const down = await changePlan(must(starter.prices[0]).id);
    expect(down.ok && down.data.scheduled_plan?.name).toBe(starter.name);
    expect((await getSubscription()).data.plan.id).toBe(business.id);
    const same = await changePlan((await getSubscription()).data.price.id);
    expect(!same.ok && same.problem.code).toBe("plans.same_plan");
    const monthly = await changePlan(must(business.prices[0]).id);
    expect(monthly.ok && monthly.data.price.interval).toBe("month");
    const bad = await changePlan("nope");
    expect(!bad.ok && bad.problem.errors?.[0]?.field).toBe("price_id");
  });

  it("huỷ gia hạn rồi tiếp tục", async () => {
    expect((await cancelRenewal()).ok).toBe(true);
    const again = await cancelRenewal();
    expect(!again.ok && again.problem.code).toBe("plans.already_canceled");
    await resumeRenewal();
    expect((await getSubscription()).data.cancel_at_period_end).toBe(false);
  });

  it("hồ sơ xuất hoá đơn: gom mọi lỗi một lần", async () => {
    const bad = await updateBillingProfile({
      legal_name: " ",
      tax_code: "123",
      email: "x",
      phone: "",
      address_province_code: "79",
      address_commune: "",
      address_line: "",
    });
    expect(!bad.ok && bad.problem.errors?.map((e) => e.field)).toEqual([
      "legal_name",
      "tax_code",
      "email",
    ]);
    const ok = await updateBillingProfile({
      legal_name: "Công ty mẫu",
      tax_code: "0101234567-001",
      email: "ketoan@example.com",
      phone: "",
      address_province_code: "01",
      address_commune: "",
      address_line: "",
    });
    expect(ok.ok).toBe(true);
  });

  it("phần trăm hạn mức", () => {
    expect(usagePercent({ used: 23, max: 50 })).toBe(46);
    expect(usagePercent({ used: 80, max: 50 })).toBe(100);
    expect(usagePercent({ used: 1, max: 0 })).toBe(0);
  });
});

describe("tên miền mẫu", () => {
  it("thêm: chữ thường, có bản ghi TXT; không nhận IP, localhost, tên trùng", async () => {
    const added = await addDomain(" Shop.Example.com. ");
    expect(added.ok && added.data.domain).toBe("shop.example.com");
    expect(added.ok && added.data.txt_name).toBe("_autoxide-challenge.shop.example.com");
    expect(added.ok && added.data.status).toBe("pending");
    for (const bad of ["10.0.0.1", "localhost", "a..b", "no-dot"]) {
      const result = await addDomain(bad);
      expect(!result.ok && result.problem.errors?.[0]?.field).toBe("domain");
    }
    const taken = await addDomain("shop.example.com");
    expect(!taken.ok && taken.problem.code).toBe("tenant_domain_taken");
  });

  it("lọc theo trạng thái, kiểm lại, gỡ thì biến khỏi danh sách", async () => {
    const failed = must((await listDomains({ status: "failed" })).data[0]);
    const checked = await verifyDomain(failed.id);
    expect(checked.ok && checked.data.status).toBe("pending");
    await revokeDomain(failed.id);
    expect((await listDomains()).data.some((d) => d.id === failed.id)).toBe(false);
    const gone = await verifyDomain(failed.id);
    expect(!gone.ok && gone.problem.status).toBe(404);
  });
});

describe("kết nối đối tác mẫu", () => {
  it("secret không bao giờ trả giá trị; để trống thì giữ", async () => {
    const mail = must((await listConnections()).data.find((c) => c.id === "mail"));
    expect(mail.settings.find((s) => s.secret)?.value).toBeNull();
    const kept = await saveConnection("mail", {
      "mail.from": "a@example.com",
      "mail.smtp_url": "",
    });
    expect(kept.ok && kept.data.settings.find((s) => s.name === "mail.smtp_url")?.is_set).toBe(
      true,
    );
  });

  it("thiếu ô bắt buộc thì báo từng ô; đủ thì kiểm tra đạt", async () => {
    const bad = await saveConnection("sms", { "sms.provider": "x" });
    expect(!bad.ok && bad.problem.errors?.map((e) => e.field)).toEqual([
      "sms.brandname",
      "sms.api_key",
    ]);
    const before = await testConnection("sms");
    expect(before.ok && before.data.last_check?.ok).toBe(false);
    await saveConnection("sms", {
      "sms.provider": "x",
      "sms.brandname": "BEPMOC",
      "sms.api_key": "k",
    });
    const after = await testConnection("sms");
    expect(after.ok && after.data.last_check?.ok).toBe(true);
  });

  it("hoá đơn điện tử còn lỗi chứng thư tới khi đổi", async () => {
    const still = await testConnection("einvoice");
    expect(still.ok && still.data.last_check?.ok).toBe(false);
    await saveConnection("einvoice", {
      "invoices.einvoice_provider": "p",
      "invoices.einvoice_username": "u",
      "invoices.einvoice_certificate": "new",
    });
    const fixed = await testConnection("einvoice");
    expect(fixed.ok && fixed.data.last_check?.ok).toBe(true);
  });
});

describe("job mẫu", () => {
  it("lọc theo trạng thái; chỉ chạy lại được job dead-letter", async () => {
    const dead = must((await listJobs({ status: "dead" })).data[0]);
    const done = must((await listJobs({ status: "done" })).data[0]);
    const notDead = await retryJob(done.id);
    expect(!notDead.ok && notDead.problem.code).toBe("kernel.job_not_dead");
    const retried = await retryJob(dead.id);
    expect(retried.ok && retried.data.status).toBe("running");
    expect((await listJobs({ status: "dead" })).data).toHaveLength(0);
  });
});
