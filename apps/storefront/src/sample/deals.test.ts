import { describe, expect, it } from "vitest";
import { discountPercent } from "@/lib/promo";
import { COUPON } from "./catalog";
import { flashSale, LEGAL_LIMIT, publicPrograms } from "./deals";
import { featuredSession, liveSessions, liveStatus } from "./live";

describe("khuyến mại mẫu", () => {
  it("flash sale luôn ở tương lai: 20:00–22:00 tối mai giờ Việt Nam, cả khi mở lúc 23:30", () => {
    for (const now of [Date.parse("2026-11-16T03:00:00Z"), Date.parse("2026-11-16T16:30:00Z")]) {
      const flash = flashSale(now);
      expect(flash.starts_at).toBeGreaterThan(now);
      expect(flash.ends_at - flash.starts_at).toBe(2 * 3_600_000);
      expect(new Date(flash.starts_at + 7 * 3_600_000).getUTCHours()).toBe(20);
    }
  });

  it("giá flash sale khớp trang quản trị và không vượt trần giảm của luật", () => {
    const flash = flashSale(Date.now());
    expect(flash.items.map((i) => [i.sku, i.sale, i.limit])).toEqual([
      ["CG26", 345_000, 20],
      ["KB4-XA", 59_400, 60],
      ["NRC750", 53_400, 80],
      ["BG6", 252_000, 40],
    ]);
    for (const item of flash.items) {
      expect(discountPercent(item.reference, item.sale)).toBeLessThanOrEqual(
        LEGAL_LIMIT.max_percent,
      );
    }
  });

  it("mã BEPMOC10 như trang quản trị: 268 / 1.000 lượt đã dùng", () => {
    const code = publicPrograms(Date.now()).find((p) => p.code === "BEPMOC10");
    expect(code?.remaining).toBe(1000 - 268);
    expect(COUPON.remaining).toBe(732);
  });
});

describe("livestream mẫu", () => {
  it("một phiên đang phát, một sắp phát, một đã kết thúc; mặc định mở phiên đang phát", () => {
    const now = Date.now();
    const sessions = liveSessions(now);
    expect(sessions.map((s) => liveStatus(s, now)).sort()).toEqual(["ended", "live", "scheduled"]);
    expect(featuredSession(sessions, now)?.title.vi).toBe("Mở hộp bộ dao 3 món");
    // Khi phiên đang phát đã xong thì mở phiên sắp phát.
    const later = sessions.map((s) =>
      liveStatus(s, now) === "live" ? { ...s, ends_at: now - 1 } : s,
    );
    expect(featuredSession(later, now)?.title.vi).toBe("Chảo gang cho bếp từ");
  });
});
