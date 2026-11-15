import { beforeEach, describe, expect, it } from "vitest";
import {
  maskBirthday,
  maskEmail,
  maskPhone,
  normalizePhone,
  parseDelays,
  parseTags,
} from "@/lib/customers";
import { ORG, resetSampleCatalog } from "./catalog";
import {
  addLoyaltyRule,
  adjustPoints,
  blockPhone,
  createProfile,
  customerStats,
  deleteGroup,
  getProfile,
  listCodBlocks,
  listGroups,
  listLoyaltyRules,
  listProfiles,
  listReferrals,
  lookupBuyer,
  loyaltyStats,
  previewRule,
  resetSampleCustomers,
  saveGroup,
  setBlockLifted,
} from "./customers";
import { resetSampleInventory } from "./inventory";
import { ordersState, resetSampleOrders } from "./orders";
import { resetSamplePromotions } from "./promotions";
import { resetSampleStores } from "./stores";
import { vietnamDay } from "./tax";

beforeEach(() => {
  resetSampleCatalog();
  resetSampleInventory();
  resetSamplePromotions();
  resetSampleOrders();
  resetSampleStores();
  resetSampleCustomers();
});

const tomorrow = () => vietnamDay(Date.now() + 86_400_000);

describe("hồ sơ khách dựng từ đơn mẫu", () => {
  it("lịch sử mua là đơn thật của người mua; tổng chi = đơn hoàn tất − hoàn tiền + đơn trước đó", async () => {
    const hoa = (await listProfiles({ q: "nguyen thi hoa" })).data[0];
    expect(hoa?.full_name).toBe("Nguyễn Thị Hoa");
    const detail = (await getProfile(hoa?.id ?? ""))?.data;
    expect(detail?.orders.map((o) => o.number)).toContain("BM-2611-0412");
    const { orders } = await ordersState();
    const completed = orders
      .filter((o) => o.buyer.name === "Nguyễn Thị Hoa" && o.status === "completed")
      .reduce((s, o) => s + Number(o.total.amount) - Number(o.refunded.amount), 0);
    expect(Number(detail?.total_spent.amount)).toBe(
      completed + Number(detail?.earlier?.amount.amount),
    );
    expect(detail?.tier_code).toBe("gold");
  });

  it("khách vãng lai tại quầy và người mua qua kênh bán ngoài không có hồ sơ", async () => {
    const { orders } = await ordersState();
    const { data } = await listProfiles({ limit: 10_000 });
    const names = new Set(data.map((p) => p.full_name));
    expect(names.has("Khách tại quầy")).toBe(false);
    const channelOnly = orders.filter(
      (o) =>
        o.channel_account &&
        !orders.some((x) => x.buyer.name === o.buyer.name && x.channel_account === null),
    );
    expect(channelOnly.length).toBeGreaterThan(0);
    for (const o of channelOnly) expect(names.has(o.buyer.name)).toBe(false);
    const stats = await customerStats();
    expect(stats.profiles).toBe(data.length);
    expect(stats.with_account + stats.phone_only).toBe(stats.profiles);
  });

  it("đăng ký tại quầy: SĐT sai báo dưới ô, trùng SĐT báo hồ sơ có sẵn, hợp lệ thì tạo hồ sơ chỉ SĐT", async () => {
    const bad = await createProfile({ phone: "12345", name: "", org_id: ORG.Q3 });
    expect(!bad.ok && bad.problem.errors?.[0]).toMatchObject({
      field: "phone",
      code: "customers.phone_invalid",
    });
    const made = await createProfile({
      phone: "+84 909 123 456",
      name: "Khách Mẫu",
      org_id: ORG.Q3,
    });
    expect(made.ok && made.data.user_id).toBeNull();
    expect(made.ok && made.data.phone).toBe("0909123456");
    const again = await createProfile({ phone: "0909 123 456", name: "", org_id: ORG.Q3 });
    expect(!again.ok && again.problem.code).toBe("customers.phone_taken");
    expect(!again.ok && again.problem.errors?.[0]?.detail).toBe("Khách Mẫu");
  });
});

describe("điểm thưởng", () => {
  it("điều chỉnh tay gom mọi lỗi một lần, gửi lại cùng mã không cộng hai lần, không làm số dư âm", async () => {
    const p = (await listProfiles({ q: "vo ngoc anh" })).data[0];
    const id = p?.id ?? "";
    const bad = await adjustPoints(id, { points: "0", reference: "x", reason: "" });
    expect(!bad.ok && bad.problem.errors?.map((e) => e.field)).toEqual([
      "points",
      "reference",
      "reason",
    ]);
    const before = p?.points.balance ?? 0;
    const first = await adjustPoints(id, {
      points: "+50",
      reference: "CSKH-TEST-1",
      reason: "Bù điểm",
    });
    const second = await adjustPoints(id, {
      points: "+50",
      reference: "cskh-test-1",
      reason: "Bù điểm",
    });
    expect(first.ok && first.data.replayed).toBe(false);
    expect(second.ok && second.data.replayed).toBe(true);
    expect((await getProfile(id))?.data.points.balance).toBe(before + 50);
    const over = await adjustPoints(id, {
      points: `-${before + 1000}`,
      reference: "CSKH-TEST-2",
      reason: "Thu hồi",
    });
    expect(!over.ok && over.problem.code).toBe("customers.insufficient_points");
  });

  it("nghĩa vụ trong sổ cái = điểm còn × giá trị điểm; thưởng đánh giá như nhau mọi số sao", async () => {
    const stats = await loyaltyStats();
    expect(Number(stats.liability.amount)).toBe(
      stats.outstanding_points * Number(stats.point_value.amount),
    );
    expect(stats.review.rewarded).toBeGreaterThan(0);
    expect(stats.review.low_star_rewarded).toBeGreaterThan(0);
  });

  it("quy tắc điểm: không hiệu lực trong quá khứ; quy tắc mới đóng quy tắc trước vào ngày trước đó", async () => {
    const past = await addLoyaltyRule({
      earn: "10000",
      value: "100",
      months: "12",
      min: "100",
      max_pct: "30",
      from: vietnamDay(),
    });
    expect(!past.ok && past.problem.errors?.[0]?.code).toBe("customers.rule_effective_in_past");
    const from = tomorrow();
    const ok = await addLoyaltyRule({
      earn: "10000",
      value: "90",
      months: "12",
      min: "100",
      max_pct: "30",
      from,
    });
    expect(ok.ok).toBe(true);
    const { data } = await listLoyaltyRules();
    const previous = data.find((r) => r.effective_from < from && r.effective_from <= vietnamDay());
    expect(previous?.effective_to).toBe(vietnamDay());
  });
});

describe("nhóm khách", () => {
  it("xem trước khớp đúng số thành viên của nhóm cùng quy tắc; trùng tên báo lỗi; nhóm đang dùng không xoá được", async () => {
    const { data } = await listGroups();
    const big = data.find((g) => g.name === "Chi trên 3 triệu");
    expect((await previewRule(big?.rule ?? {})).matched).toBe(big?.member_count);
    const clash = await saveGroup({
      name: "khách vàng",
      kind: "rule",
      rule: { tier_in: ["gold"] },
    });
    expect(!clash.ok && clash.problem.code).toBe("customers.group_name_taken");
    const gold = data.find((g) => g.name === "Khách Vàng");
    expect(!(await deleteGroup(gold?.id ?? "")).ok).toBe(true);
    const empty = await saveGroup({ name: "Trống", kind: "rule", rule: {} });
    expect(!empty.ok && empty.problem.errors?.[0]?.code).toBe("customers.rule_empty");
  });
});

describe("giới thiệu bạn và rủi ro COD", () => {
  it("trạng thái giới thiệu theo đơn đầu thật; cùng SĐT bị loại", async () => {
    const { data } = await listReferrals();
    const trang = data.find((r) => r.referee_name === "Lê Thu Trang");
    expect(trang?.status).toBe("pending");
    expect(trang?.first_order?.number).toMatch(/^BM-2611-/);
    expect(data.find((r) => r.status === "rejected")?.reason).toBe("customers.self_referral");
    expect(data.some((r) => r.status === "rewarded")).toBe(true);
  });

  it("tra SĐT sai báo dưới ô; chặn cần hạn trong tương lai và ghi chú; gỡ chặn đảo được", async () => {
    const bad = await lookupBuyer("abc");
    expect(!bad.ok && bad.problem.errors?.[0]?.code).toBe("customers.phone_invalid");
    const missing = await blockPhone({
      phone: "0901234567",
      reason: "other",
      until: vietnamDay(),
      note: "",
    });
    expect(!missing.ok && missing.problem.errors?.map((e) => e.field)).toEqual(["until", "note"]);
    const made = await blockPhone({
      phone: "0901234567",
      reason: "other",
      until: tomorrow(),
      note: "Thử",
    });
    expect(made.ok).toBe(true);
    const id = made.ok ? made.data.id : "";
    expect((await setBlockLifted(id, true)).ok).toBe(true);
    expect((await listCodBlocks("lifted")).data.some((b) => b.id === id)).toBe(true);
    expect((await setBlockLifted(id, false)).ok).toBe(true);
    expect((await listCodBlocks("blocked")).data.some((b) => b.id === id)).toBe(true);
  });
});

describe("che dữ liệu cá nhân", () => {
  it("SĐT, email, ngày sinh che bớt; SĐT chuẩn hoá; nhãn và mốc nhắc đọc đúng", () => {
    expect(maskPhone("0909123456")).toBe("09•• ••• 456");
    expect(maskEmail("hoa@example.com")).toBe("h•••@example.com");
    expect(maskBirthday("1988-03-21")).toBe("••/03/1988");
    expect(normalizePhone("84 909 123 456")).toBe("0909123456");
    expect(normalizePhone("0209123456")).toBeNull();
    expect(parseTags("a, A, b ,, c")).toEqual(["a", "b", "c"]);
    expect(parseDelays("60, 1440")).toEqual([60, 1440]);
    expect(parseDelays("60, 30")).toBeNull();
    expect(parseDelays("5")).toBeNull();
  });
});
