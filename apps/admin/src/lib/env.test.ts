import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleDataSetting } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AUTOXIDE_WEB_SAMPLE_DATA", () => {
  it("mặc định tắt, kể cả khi chạy dev (W-060)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTOXIDE_WEB_SAMPLE_DATA", "");
    expect(sampleDataSetting()).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(sampleDataSetting()).toBe(false);
  });

  it("chỉ bật khi đặt rõ true / 1", () => {
    vi.stubEnv("AUTOXIDE_WEB_SAMPLE_DATA", "true");
    expect(sampleDataSetting()).toBe(true);
    vi.stubEnv("AUTOXIDE_WEB_SAMPLE_DATA", "1");
    expect(sampleDataSetting()).toBe(true);
    vi.stubEnv("AUTOXIDE_WEB_SAMPLE_DATA", "false");
    expect(sampleDataSetting()).toBe(false);
  });
});
