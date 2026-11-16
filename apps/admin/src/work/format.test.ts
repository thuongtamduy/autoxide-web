import { describe, expect, it } from "vitest";
import { dayText, relativeTime, renderMessage } from "./format";

describe("chữ của hộp việc", () => {
  it("điền tiền và ngày theo ngôn ngữ", () => {
    const t = (key: string, values?: Record<string, string | number>) =>
      `${key}|${JSON.stringify(values)}`;
    expect(
      renderMessage(
        t,
        {
          key: "items.codMismatch.title",
          params: { amount: { money: { amount: "180000", currency: "VND" } }, n: 2 },
        },
        "vi",
      ),
    ).toBe('items.codMismatch.title|{"amount":"180.000 ₫","n":2}');
    expect(dayText("2027-01-01", "vi")).toContain("2027");
  });

  it("khoảng thời gian tương đối theo phút, giờ, ngày", () => {
    const now = Date.parse("2026-11-15T03:00:00Z");
    expect(relativeTime(now - 5 * 60_000, now, "en")).toBe("5 minutes ago");
    expect(relativeTime(now + 3 * 3_600_000, now, "en")).toBe("in 3 hours");
    expect(relativeTime(now - 3 * 86_400_000, now, "en")).toBe("3 days ago");
  });
});
