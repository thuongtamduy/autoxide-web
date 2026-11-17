import { describe, expect, it } from "vitest";
import {
  type CalendarHoliday,
  type CalendarRule,
  clock,
  cutoffChoices,
  dayInfo,
  dayMonth,
  dayPlan,
  fullDay,
  isDay,
  isMonth,
  longDay,
  monthGrid,
  monthTitle,
  ruleAt,
  shiftMonth,
  shortDay,
  weekdayNames,
} from "./shipping-calendar";

const RULES: CalendarRule[] = [
  { id: "a", cutoff: "16:00", workdays: [1, 2, 3, 4, 5, 6], effective_from: "2026-01-01" },
  { id: "b", cutoff: "15:00", workdays: [1, 2, 3, 4, 5], effective_from: "2026-12-01" },
];
const HOLIDAYS: CalendarHoliday[] = [
  {
    id: "h1",
    org_id: null,
    name: "Tết Dương lịch",
    from: "2027-01-01",
    to: "2027-01-01",
    status: "confirmed",
  },
  {
    id: "h2",
    org_id: "wh",
    name: "Kiểm kê kho",
    from: "2026-11-20",
    to: "2026-11-20",
    status: "confirmed",
  },
  {
    id: "h3",
    org_id: null,
    name: "Tết Nguyên đán",
    from: null,
    to: null,
    status: "awaiting_notice",
  },
];

describe("lưới tháng", () => {
  it("tuần bắt đầu từ thứ Hai, đủ tuần, đánh dấu ngày ngoài tháng", () => {
    // 01/11/2026 là Chủ nhật: tuần đầu bắt đầu thứ Hai 26/10.
    const weeks = monthGrid("2026-11", RULES, HOLIDAYS, "2026-11-17");
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]?.[0]?.day).toBe("2026-10-26");
    expect(weeks[0]?.[0]?.inMonth).toBe(false);
    expect(weeks[0]?.[6]?.day).toBe("2026-11-01");
    expect(weeks[5]?.[0]?.day).toBe("2026-11-30");
    const all = weeks.flat();
    expect(all.find((d) => d.day === "2026-11-17")?.isToday).toBe(true);
    expect(all.find((d) => d.day === "2026-11-16")?.isPast).toBe(true);
  });

  it("ngày lấy hàng có giờ chốt, Chủ nhật không lấy, ngày nghỉ của cả chuỗi, nghỉ riêng của nút", () => {
    const thu = dayInfo("2026-11-19", RULES, HOLIDAYS, "2026-11-17");
    expect(thu.kind).toBe("pickup");
    expect(thu.cutoff).toBe("16:00");
    expect(dayInfo("2026-11-22", RULES, HOLIDAYS, "2026-11-17").kind).toBe("off");
    const newYear = dayInfo("2027-01-01", RULES, HOLIDAYS, "2026-11-17");
    expect(newYear.kind).toBe("holiday");
    expect(newYear.holidays).toEqual(["Tết Dương lịch"]);
    // Nghỉ riêng của kho không đổi lịch cả chuỗi.
    const count = dayInfo("2026-11-20", RULES, HOLIDAYS, "2026-11-17");
    expect(count.kind).toBe("pickup");
    expect(count.local.map((h) => h.name)).toEqual(["Kiểm kê kho"]);
  });

  it("phiên bản lịch mới áp từ ngày hiệu lực", () => {
    const start = dayInfo("2026-12-01", RULES, HOLIDAYS, "2026-11-17");
    expect(start.starts?.id).toBe("b");
    expect(start.cutoff).toBe("15:00");
    // Thứ Bảy theo lịch mới (thứ Hai – thứ Sáu) không lấy hàng; theo lịch cũ thì có.
    expect(dayInfo("2026-12-05", RULES, HOLIDAYS, "2026-11-17").kind).toBe("off");
    expect(dayInfo("2026-11-28", RULES, HOLIDAYS, "2026-11-17").kind).toBe("pickup");
    expect(ruleAt(RULES, "2025-12-31")).toBeNull();
    expect(dayInfo("2025-12-31", RULES, HOLIDAYS, "2026-11-17").kind).toBe("off");
  });
});

describe("ví dụ ngày giao", () => {
  it("đặt trước giờ chốt lấy trong ngày, sau giờ chốt lấy ngày làm việc kế tiếp", () => {
    // Thứ Bảy 21/11: trước 16:00 lấy hôm đó; sau 16:00 bỏ Chủ nhật, lấy thứ Hai 23/11.
    const plan = dayPlan("2026-11-21", RULES, HOLIDAYS);
    expect(plan.cutoff).toBe("16:00");
    expect(plan.before).toMatchObject({
      pickup_date: "2026-11-21",
      eta_from: "2026-11-23",
      eta_to: "2026-11-24",
    });
    expect(plan.after).toMatchObject({ pickup_date: "2026-11-23", eta_from: "2026-11-24" });
  });

  it("ngày không lấy hàng chỉ có một ví dụ; trước ngày có lịch thì không có", () => {
    const sunday = dayPlan("2026-11-22", RULES, HOLIDAYS);
    expect(sunday.before).toBeNull();
    expect(sunday.after?.pickup_date).toBe("2026-11-23");
    // Ngày nghỉ và ngày không làm việc được bỏ qua: 31/12 sau giờ chốt → lấy thứ Hai 04/01.
    expect(dayPlan("2026-12-31", RULES, HOLIDAYS).after?.pickup_date).toBe("2027-01-04");
    expect(dayPlan("2025-06-01", RULES, HOLIDAYS)).toEqual({
      cutoff: null,
      before: null,
      after: null,
    });
  });
});

describe("định dạng", () => {
  it("ngày trước tháng ở cả hai ngôn ngữ, giờ 24h", () => {
    expect(dayMonth("2026-11-05", "en")).toBe("05/11");
    expect(dayMonth("2026-11-05", "vi")).toBe("05/11");
    expect(fullDay("2026-11-19", "en")).toBe("19/11/2026");
    expect(shortDay("2026-11-19", "en")).toBe("Thu 19/11");
    expect(longDay("2026-11-19", "en")).toBe("Thursday 19/11/2026");
    expect(longDay("2026-11-19", "vi")).toBe("Thứ Năm 19/11/2026");
    expect(monthTitle("2026-11", "en")).toBe("November 2026");
    expect(weekdayNames("en")[0]).toBe("Mon");
    expect(weekdayNames("en")[6]).toBe("Sun");
    expect(clock("9:05")).toBe("09:05");
  });

  it("giờ chốt chọn được theo nấc 30 phút, giữ giờ lệch nấc đang dùng", () => {
    const choices = cutoffChoices("16:00");
    expect(choices[0]).toBe("08:00");
    expect(choices.at(-1)).toBe("22:00");
    expect(choices).toContain("16:30");
    expect(choices.some((c) => /AM|PM/.test(c))).toBe(false);
    expect(cutoffChoices("15:45")).toContain("15:45");
  });

  it("tháng và ngày trên địa chỉ", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isDay("2026-11-19")).toBe(true);
    expect(isDay("19/11/2026")).toBe(false);
  });
});
