import { describe, expect, it } from "vitest";
import { countdown, pad2, vietnamMidnight, vietnamTime } from "./countdown";

const at = (iso: string) => Date.parse(iso);

describe("đếm ngược", () => {
  it("ba giai đoạn so với bây giờ", () => {
    const start = at("2026-11-17T13:00:00Z");
    const end = at("2026-11-17T15:00:00Z");
    expect(countdown(at("2026-11-16T10:58:30Z"), start, end)).toMatchObject({
      phase: "upcoming",
      days: 1,
      hours: 2,
      minutes: 1,
      seconds: 30,
    });
    expect(countdown(at("2026-11-17T14:30:00Z"), start, end)).toMatchObject({
      phase: "running",
      days: 0,
      hours: 0,
      minutes: 30,
    });
    expect(countdown(end, start, end)).toMatchObject({ phase: "ended", remaining: 0 });
  });

  it("nửa đêm và giờ theo giờ Việt Nam (UTC+7), kể cả sau 22:00", () => {
    // 23:30 ngày 16/11 giờ Việt Nam.
    const late = at("2026-11-16T16:30:00Z");
    expect(new Date(vietnamMidnight(late)).toISOString()).toBe("2026-11-15T17:00:00.000Z");
    expect(vietnamTime(late)).toBe("23:30");
    // 00:10 ngày 17/11 giờ Việt Nam đã là ngày mới.
    expect(new Date(vietnamMidnight(at("2026-11-16T17:10:00Z"))).toISOString()).toBe(
      "2026-11-16T17:00:00.000Z",
    );
    expect(pad2(7)).toBe("07");
  });
});
