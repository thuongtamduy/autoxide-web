import { describe, expect, it } from "vitest";
import { deviceOf } from "./device";

describe("deviceOf", () => {
  it("đọc trình duyệt và hệ điều hành", () => {
    expect(
      deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"),
    ).toEqual({ browser: "Firefox", os: "Windows" });
    expect(
      deviceOf(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ browser: "Mobile Safari", os: "iOS" });
  });

  it("không có hay không đọc được thì null", () => {
    expect(deviceOf(null)).toBeNull();
    expect(deviceOf("")).toBeNull();
    expect(deviceOf("node")).toBeNull();
  });
});
