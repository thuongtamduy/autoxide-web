import { describe, expect, it } from "vitest";
import { nextTheme, themeAttr } from "./theme";

describe("sáng / tối", () => {
  it("chỉ nhận light / dark từ cookie", () => {
    expect(themeAttr("dark")).toBe("dark");
    expect(themeAttr("light")).toBe("light");
    expect(themeAttr("system")).toBeUndefined();
    expect(themeAttr(undefined)).toBeUndefined();
  });

  it("bấm nút thì đổi ngược với giao diện đang thấy, kể cả khi đang theo máy", () => {
    expect(nextTheme("dark", false)).toBe("light");
    expect(nextTheme("light", true)).toBe("dark");
    expect(nextTheme(undefined, true)).toBe("light");
    expect(nextTheme(undefined, false)).toBe("dark");
  });
});
