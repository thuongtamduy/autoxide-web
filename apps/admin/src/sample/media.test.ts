import { beforeEach, describe, expect, it } from "vitest";
import { getMediaAlts, putMediaAlts, resetMediaAlts } from "./media";

const ID = "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81";

beforeEach(resetMediaAlts);

describe("alt theo ngôn ngữ (dữ liệu mẫu)", () => {
  it("lưu, đọc lại; ảnh trang trí để alt trống", async () => {
    expect((await getMediaAlts(ID)).data.alts).toEqual([]);
    const saved = await putMediaAlts(ID, [
      { locale: "vi", alt: "  Chảo gang  ", decorative: false },
      { locale: "en", alt: "Pan", decorative: true },
    ]);
    expect(saved.ok && saved.data.alts).toEqual([
      { locale: "vi", alt: "Chảo gang", decorative: false },
      { locale: "en", alt: "", decorative: true },
    ]);
    expect((await getMediaAlts(ID)).data.alts).toHaveLength(2);
  });

  it("ngôn ngữ sai hay alt quá dài: báo lỗi theo ô", async () => {
    const result = await putMediaAlts(ID, [
      { locale: "Việt", alt: "x".repeat(1001), decorative: false },
    ]);
    expect(result.ok ? [] : result.problem.errors?.map((e) => e.field)).toEqual([
      "alts[0].locale",
      "alts[0].alt",
    ]);
  });
});
