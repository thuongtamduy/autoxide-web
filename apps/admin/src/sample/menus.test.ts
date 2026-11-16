import { describe, expect, it } from "vitest";
import { CORE_REF_KINDS } from "@/lib/menus";
import { listSampleRefKinds, listSampleRefObjects } from "./menus";

describe("sổ đối tượng mẫu của màn Menu (chờ bước 34, 41, 43, 46)", () => {
  it("chỉ có loại core chưa đăng ký, mỗi đối tượng gắn cờ mẫu", async () => {
    const kinds = (await listSampleRefKinds()).data;
    expect(kinds.map((k) => k.kind)).toEqual([
      "catalog.category",
      "promotions.promotion",
      "marketplace.seller",
      "organizations.store",
    ]);
    expect(kinds.every((k) => k.step !== null)).toBe(true);
    const core = new Set(CORE_REF_KINDS.map((k) => k.kind));
    const objects = (await listSampleRefObjects()).data;
    expect(objects.every((o) => o.sample && !core.has(o.kind))).toBe(true);
    // Danh mục sản phẩm có cây, để thử "tự lấy nhóm con".
    expect(objects.find((o) => o.title === "Dụng cụ nấu")?.children).toContain("Chảo");
  });
});
