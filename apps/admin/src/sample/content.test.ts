import { beforeEach, describe, expect, it } from "vitest";
import {
  draftFromTemplate,
  entryWebsite,
  listWebsites,
  resetContentSample,
  setEntryWebsite,
  websiteChecklist,
} from "./content";

beforeEach(resetContentSample);

describe("dữ liệu mẫu của Nội dung", () => {
  it("tạo bản nháp từ mẫu cho trang còn thiếu; trang cấu hình nơi khác không có mẫu", async () => {
    const [main, market] = (await listWebsites()).data;
    if (!main || !market) throw new Error("thiếu website mẫu");
    const before = await websiteChecklist(main.id);
    expect(
      before.ok && before.data.pages.find((p) => p.page_kind === "inspection_policy")?.status,
    ).toBe("missing");
    expect((await draftFromTemplate(main.id, "inspection_policy")).ok).toBe(true);
    const after = await websiteChecklist(main.id);
    expect(
      after.ok && after.data.pages.find((p) => p.page_kind === "inspection_policy")?.status,
    ).toBe("draft");
    const elsewhere = await draftFromTemplate(market.id, "seller_info");
    expect(elsewhere.ok ? "" : elsewhere.problem.code).toBe("content.template_not_found");
    const unknown = await websiteChecklist("01a1e000-0000-7000-8000-000000000000");
    expect(unknown.ok ? "" : unknown.problem.code).toBe("compliance.website_not_found");
  });

  it("bài mặc định thuộc website đầu tiên, chuyển được sang website khác", async () => {
    const [main, market] = (await listWebsites()).data;
    if (!main || !market) throw new Error("thiếu website mẫu");
    const entry = "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e11";
    expect((await entryWebsite(entry)).data.website_id).toBe(main.id);
    expect((await setEntryWebsite(entry, market.id)).ok).toBe(true);
    expect((await entryWebsite(entry)).data.website_id).toBe(market.id);
    expect((await setEntryWebsite(entry, "01a1e000-0000-7000-8000-000000000000")).ok).toBe(false);
  });
});
