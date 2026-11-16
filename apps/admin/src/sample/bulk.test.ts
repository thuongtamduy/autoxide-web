import { afterEach, describe, expect, it } from "vitest";
import { listBulkRuns, previewTaxChange, resetSampleBulk, runTaxChange } from "./bulk";
import { CATEGORY_ID, listProducts, resetSampleCatalog } from "./catalog";

afterEach(() => {
  resetSampleCatalog();
  resetSampleBulk();
});

describe("thao tác hàng loạt: chạy thử rồi chạy thật", () => {
  it("chạy thử không ghi gì và nói từng sản phẩm sẽ ra sao", async () => {
    const filter = { category_id: CATEGORY_ID.kitchen, tax_category: "vat.standard" };
    const preview = await previewTaxChange(filter);
    if (!preview.ok) throw new Error(preview.problem.code);
    const { counts, results, expected_count } = preview.data;
    expect(expected_count).toBe(results.length);
    expect(counts.ok + counts.skipped + counts.failed).toBe(expected_count);
    expect(counts.ok).toBeGreaterThan(0);
    // Không ghi gì: chạy thử lần hai ra cùng kết quả.
    const again = await previewTaxChange(filter);
    expect(again.ok && again.data.counts).toEqual(counts);
  });

  it("số khớp lúc chạy khác lúc chạy thử thì 409 và không đổi gì", async () => {
    const filter = { category_id: CATEGORY_ID.kitchen, tax_category: "vat.standard" };
    const preview = await previewTaxChange(filter);
    if (!preview.ok) throw new Error(preview.problem.code);
    const run = await runTaxChange({ ...filter, expected_count: preview.data.expected_count + 1 });
    expect(!run.ok && run.problem.code).toBe("kernel.bulk_count_changed");
    expect((await listBulkRuns()).data).toEqual([]);
  });

  it("chạy thật đổi đúng các sản phẩm 'sẽ áp dụng' và ghi lần chạy", async () => {
    const filter = { category_id: CATEGORY_ID.kitchen, tax_category: "vat.standard" };
    const preview = await previewTaxChange(filter);
    if (!preview.ok) throw new Error(preview.problem.code);
    const run = await runTaxChange({ ...filter, expected_count: preview.data.expected_count });
    if (!run.ok) throw new Error(run.problem.code);
    expect(run.data.counts.ok).toBe(preview.data.counts.ok);
    const products = await listProducts({ category_id: CATEGORY_ID.kitchen, limit: 500 });
    for (const p of products.data.filter((x) => x.status !== "archived")) {
      expect(p.tax_category).toBe("vat.standard");
    }
    const after = await previewTaxChange(filter);
    expect(after.ok && after.data.counts.ok).toBe(0);
    expect((await listBulkRuns()).data).toHaveLength(1);
  });

  it("nhóm thuế không có thì báo lỗi ở ô", async () => {
    const bad = await previewTaxChange({ category_id: CATEGORY_ID.kitchen, tax_category: "vat.x" });
    expect(!bad.ok && bad.problem.errors?.[0]?.field).toBe("tax_category");
  });
});
