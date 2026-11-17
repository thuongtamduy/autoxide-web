import { describe, expect, it } from "vitest";
import {
  isBytes,
  limitsText,
  type Plan,
  parseChoice,
  parseLimits,
  priceChoices,
  splitList,
  tightest,
  usagePercent,
} from "./plans";

const limit = (key: string, used: number, max: number | null) => ({
  key,
  kind: "count",
  used,
  max,
  over_limit: false,
});

describe("hạn mức", () => {
  it("phần trăm đã dùng, không giới hạn là 0, giới hạn 0 có dùng là 100", () => {
    expect(usagePercent({ used: 3, max: 4 })).toBe(75);
    expect(usagePercent({ used: 9, max: 4 })).toBe(100);
    expect(usagePercent({ used: 9, max: null })).toBe(0);
    expect(usagePercent({ used: 1, max: 0 })).toBe(100);
  });

  it("hạn mức gần chạm nhất, bỏ qua không giới hạn", () => {
    expect(tightest([limit("a", 1, 10), limit("b", 8, 10), limit("c", 99, null)])?.key).toBe("b");
    expect(tightest([limit("c", 1, null)])).toBeNull();
    expect(isBytes("files.storage_bytes")).toBe(true);
    expect(isBytes("auth.members")).toBe(false);
  });

  it("ô hạn mức: khoá = số, ∞, trống là không giới hạn; dòng sai báo số dòng", () => {
    expect(
      parseLimits("auth.members = 5\n\nfiles.storage_bytes = ∞\norganizations.units ="),
    ).toEqual({
      limits: { "auth.members": 5, "files.storage_bytes": null, "organizations.units": null },
      errors: [],
    });
    expect(parseLimits("x = nhiều\n= 3").errors).toEqual([1, 2]);
    expect(limitsText({ "auth.members": 5, "files.storage_bytes": null })).toBe(
      "auth.members = 5\nfiles.storage_bytes = ∞",
    );
  });

  it("danh sách cách bằng dấu phẩy hay xuống dòng", () => {
    expect(splitList(" content, media\ncontent ,")).toEqual(["content", "media"]);
  });
});

describe("đổi gói", () => {
  const price = (id: string, active = true, kind = "recurring") => ({
    id,
    active,
    kind,
    interval: "month",
    interval_count: 1,
    included: 0,
    amount: { amount: "100000", currency: "VND" },
    created_at: "2026-01-01T00:00:00Z",
  });
  const plan = (id: string, status: string, kind: string, prices: ReturnType<typeof price>[]) =>
    ({ id, name: id, status, kind, prices }) as unknown as Plan;

  it("chỉ gói chính đang bán, giá định kỳ đang bán", () => {
    const choices = priceChoices([
      plan("a", "active", "base", [price("p1"), price("p2", false), price("p3", true, "metered")]),
      plan("b", "draft", "base", [price("p4")]),
      plan("c", "active", "addon", [price("p5")]),
    ]);
    expect(choices.map((c) => c.value)).toEqual(["a|p1"]);
  });

  it("tách giá trị của ô đổi gói", () => {
    const id = "01a1e300-0000-7000-8000-0000000000b1";
    expect(parseChoice(`${id}|${id}`)).toEqual({ plan_id: id, price_id: id });
    expect(parseChoice("x|y")).toBeNull();
  });
});
