import { describe, expect, it } from "vitest";
import {
  areaPath,
  dayPoints,
  dayRange,
  formatChange,
  formatTick,
  formatValue,
  labelIndexes,
  linePath,
  niceTicks,
  percentChange,
  periodWithPrevious,
  presetRange,
  shiftDay,
  sumByDay,
  sumByDayAndKey,
  yAt,
} from "./chart";

describe("ngày", () => {
  it("cộng trừ ngày qua tháng, năm", () => {
    expect(shiftDay("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("dãy ngày gồm hai đầu; ngược thì rỗng", () => {
    expect(dayRange("2026-02-27", "2026-03-02")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
    expect(dayRange("2026-03-02", "2026-03-01")).toEqual([]);
  });

  it("kỳ hiện tại và kỳ liền trước cùng độ dài, không chồng nhau", () => {
    const { current, previous } = periodWithPrevious("2026-11-17", 7);
    expect(current).toHaveLength(7);
    expect(previous).toHaveLength(7);
    expect(current[0]).toBe("2026-11-11");
    expect(current.at(-1)).toBe("2026-11-17");
    expect(previous.at(-1)).toBe("2026-11-10");
    expect(presetRange("2026-11-17", 30)).toEqual({ from: "2026-10-19", to: "2026-11-17" });
  });
});

describe("gom theo ngày", () => {
  const days = ["2026-11-15", "2026-11-16", "2026-11-17"];

  it("cộng theo ngày, ngày trống là 0, bỏ điểm ngoài kỳ", () => {
    expect(
      sumByDay(
        [
          { day: "2026-11-15", value: 100 },
          { day: "2026-11-15", value: 50 },
          { day: "2026-11-17", value: 20 },
          { day: "2026-11-14", value: 999 },
        ],
        days,
      ),
    ).toEqual([150, 0, 20]);
  });

  it("tách theo khoá; khoá lạ bị bỏ, khoá không có điểm vẫn có dãy 0", () => {
    const out = sumByDayAndKey(
      [
        { day: "2026-11-16", key: "web", value: 10 },
        { day: "2026-11-16", key: "pos", value: 5 },
        { day: "2026-11-16", key: "marketplace", value: 7 },
      ],
      days,
      ["web", "pos", "shopee"],
    );
    expect(out.get("web")).toEqual([0, 10, 0]);
    expect(out.get("pos")).toEqual([0, 5, 0]);
    expect(out.get("shopee")).toEqual([0, 0, 0]);
    expect(out.has("marketplace")).toBe(false);
  });
});

describe("phần trăm thay đổi", () => {
  it("tăng, giảm, kỳ trước bằng 0", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(75, 100)).toBe(-25);
    expect(percentChange(10, 0)).toBeNull();
  });

  it("có dấu theo ngôn ngữ", () => {
    expect(formatChange(12.5, "en")).toBe("+12.5%");
    expect(formatChange(-3, "vi")).toBe("−3%");
  });
});

describe("trục", () => {
  it("vạch tròn từ 0 và vạch trên cùng phủ giá trị lớn nhất", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(100)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(83)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(17)).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(4_200_000)).toEqual([
      0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000,
    ]);
    expect(niceTicks(1.9)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("nhãn trục gọn từ 10.000, đầy đủ dưới đó", () => {
    expect(formatTick(2_000_000, "money", "en", 4_000_000)).toBe("2M");
    expect(formatTick(2_500, "count", "en", 5_000)).toBe("2,500");
    expect(formatTick(2, "percent", "vi", 2)).toBe("2%");
  });

  it("số đầy đủ cho bảng: tiền, số đếm, phần trăm", () => {
    expect(formatValue(590_000, "money", "vi")).toBe("590.000 ₫");
    expect(formatValue(1234, "count", "en")).toBe("1,234");
    expect(formatValue(97.5, "percent", "en")).toBe("97.5%");
  });

  it("mốc trục X cách đều, luôn có đầu và cuối, không quá số mốc tối đa", () => {
    expect(labelIndexes(3)).toEqual([0, 1, 2]);
    const thirty = labelIndexes(30);
    expect(thirty[0]).toBe(0);
    expect(thirty.at(-1)).toBe(29);
    expect(thirty.length).toBeLessThanOrEqual(6);
    expect(labelIndexes(0)).toEqual([]);
  });

  it("nhãn ngày theo ngôn ngữ, không lệch múi giờ", () => {
    const [vi] = dayPoints(["2026-11-17"], "vi");
    const [en] = dayPoints(["2026-11-17"], "en");
    expect(vi?.short).toBe("17/11");
    expect(en?.short).toBe("11/17");
    expect(en?.long).toContain("2026");
  });
});

describe("đường SVG", () => {
  it("một điểm cho mỗi giá trị, giá trị lớn nhất ở đỉnh", () => {
    const d = linePath([0, 50, 100], 100);
    expect(d).toBe("M0,100 L50,50 L100,0");
    expect(yAt(150, 100)).toBe(0);
    expect(yAt(5, 0)).toBe(100);
  });

  it("vùng khép về đáy", () => {
    expect(areaPath([0, 100], 100)).toBe("M0,100 L100,0 L100,100 L0,100 Z");
    expect(areaPath([], 100)).toBe("");
  });
});
