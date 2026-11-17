import { describe, expect, it } from "vitest";
import { grantState, hoursLeft } from "@/lib/support";

const NOW = Date.parse("2026-11-17T08:00:00Z");

describe("grantState", () => {
  it("thu hồi thắng hạn; tới hạn là hết hạn; còn lại đang hiệu lực", () => {
    const at = (revoked_at: string | null, expires_at: string) =>
      grantState({ revoked_at, expires_at }, NOW);
    expect(at("2026-11-17T07:00:00Z", "2026-11-17T09:00:00Z")).toBe("revoked");
    expect(at(null, "2026-11-17T08:00:00Z")).toBe("expired");
    expect(at(null, "2026-11-17T09:00:00Z")).toBe("active");
  });
});

describe("hoursLeft", () => {
  it("làm tròn lên theo giờ, không âm", () => {
    expect(hoursLeft("2026-11-17T08:10:00Z", NOW)).toBe(1);
    expect(hoursLeft("2026-11-17T12:00:00Z", NOW)).toBe(4);
    expect(hoursLeft("2026-11-17T12:00:01Z", NOW)).toBe(5);
    expect(hoursLeft("2026-11-17T07:00:00Z", NOW)).toBe(0);
  });
});
