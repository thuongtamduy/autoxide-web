// Chuỗi theo thời gian của bộ mẫu cho biểu đồ: khớp với số tổng các màn đang hiện.
import { describe, expect, it } from "vitest";
import { dayRange, presetRange } from "@/lib/chart";
import { channelDaily, channelReport, dailyChannelRevenue, defaultReportRange } from "./channels";
import { sellerMetricHistory, sellerPerformance } from "./market";
import { SELLER } from "./market-data";
import { vnd } from "./orders";
import { getOpsHistory, getOpsStatus, newDeadPerHour } from "./platform";

describe("doanh thu theo ngày và kênh", () => {
  const order = (placed: string, channel: string, total: number, extra = {}) => ({
    placed_at: placed,
    channel: channel as "web",
    status: "confirmed" as const,
    total: vnd(total),
    refunded: vnd(0),
    ...extra,
  });

  it("theo ngày đặt giờ Việt Nam, trừ hoàn tiền, bỏ đơn huỷ và đơn của người bán trên sàn", () => {
    const days = ["2026-11-15", "2026-11-16"];
    const out = dailyChannelRevenue(
      [
        order("2026-11-15T03:00:00Z", "web", 100_000),
        // 23:30 ngày 15 UTC = 6:30 ngày 16 giờ Việt Nam
        order("2026-11-15T23:30:00Z", "web", 50_000, { refunded: vnd(10_000) }),
        order("2026-11-16T03:00:00Z", "shopee", 70_000),
        order("2026-11-16T03:00:00Z", "pos", 30_000, { status: "cancelled" }),
        order("2026-11-16T03:00:00Z", "marketplace", 999_000),
      ],
      days,
    );
    expect(out.get("web")).toEqual([100_000, 40_000]);
    expect(out.get("shopee")).toEqual([0, 70_000]);
    expect(out.get("pos")).toEqual([0, 0]);
    expect(out.get("tiktok_shop")).toEqual([0, 0]);
  });

  it("tổng các đường bằng doanh thu mọi kênh của bảng báo cáo", async () => {
    const { from, to } = defaultReportRange();
    const [daily, report] = await Promise.all([channelDaily(from, to), channelReport(from, to)]);
    expect(daily.days).toEqual(dayRange(from, to));
    const sumLines = [...daily.series.values()].flat().reduce((a, b) => a + b, 0);
    const sumTable = report.rows.reduce((a, r) => a + Number(r.revenue.amount), 0);
    expect(sumLines).toBe(sumTable);
    expect(sumLines).toBeGreaterThan(0);
  });

  it("kỳ 90 ngày có đủ 90 mốc", async () => {
    const { from, to } = presetRange(defaultReportRange().to, 90);
    expect((await channelDaily(from, to)).days).toHaveLength(90);
  });
});

describe("tồn đọng theo giờ", () => {
  it("24 giờ, giờ cuối là số hiện tại", async () => {
    const [{ data: history }, { data: ops }] = await Promise.all([getOpsHistory(), getOpsStatus()]);
    const rows = ops.databases.flatMap((db) => db.backlog);
    expect(history).toHaveLength(24);
    expect(history.at(-1)?.jobs_pending).toBe(rows.reduce((a, r) => a + r.jobs_pending, 0));
    expect(history.at(-1)?.jobs_dead).toBe(rows.reduce((a, r) => a + r.jobs_dead, 0));
    // Mốc tăng dần, cách nhau một giờ.
    expect(Date.parse(history[1]?.at ?? "") - Date.parse(history[0]?.at ?? "")).toBe(3_600_000);
  });

  it("job mới vào dead-letter mỗi giờ là hiệu không âm", () => {
    expect(
      newDeadPerHour([{ jobs_dead: 6 }, { jobs_dead: 8 }, { jobs_dead: 5 }, { jobs_dead: 17 }]),
    ).toEqual([0, 2, 0, 12]);
  });
});

describe("xu hướng chỉ số người bán", () => {
  it("13 tuần, điểm cuối là chỉ số hiện tại", async () => {
    const [{ data: history }, { data: now }] = await Promise.all([
      sellerMetricHistory(SELLER.khanBong),
      sellerPerformance(SELLER.khanBong),
    ]);
    expect(history).toHaveLength(13);
    expect(history.at(-1)?.on_time_bp).toBe(now.metrics?.on_time_bp);
    expect(history.at(-1)?.seller_cancel_bp).toBe(now.metrics?.seller_cancel_bp);
    expect((history[0]?.day ?? "") < (history.at(-1)?.day ?? "")).toBe(true);
  });

  it("người bán chưa có chỉ số thì không có xu hướng", async () => {
    expect((await sellerMetricHistory("không-có")).data).toEqual([]);
  });
});
