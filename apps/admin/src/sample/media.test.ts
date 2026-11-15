import { beforeEach, describe, expect, it } from "vitest";
import { getMediaDecorative, putMediaDecorative, resetMediaDecorative } from "./media";

const ID = "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81";

describe("cờ ảnh trang trí (dữ liệu mẫu)", () => {
  beforeEach(resetMediaDecorative);

  it("mặc định tắt, bật rồi tắt được", async () => {
    expect((await getMediaDecorative(ID)).data).toBe(false);
    await putMediaDecorative(ID, true);
    expect((await getMediaDecorative(ID)).data).toBe(true);
    await putMediaDecorative(ID, false);
    expect((await getMediaDecorative(ID)).data).toBe(false);
  });
});
