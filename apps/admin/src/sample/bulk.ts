// Dữ liệu mẫu của "Xem trước thao tác hàng loạt" (W-006, W-020): chạy thử (dry-run) một thao tác trên
// nhiều bản ghi rồi mới chạy thật, theo thao tác hàng loạt của bước 51 P8 của core (`POST
// /api/v1/kernel/bulk/{resource}/{action}` nhận `filter` + `expected_count`, chạy bằng job, kết quả từng
// bản ghi `ok` / `skipped` / `failed` kèm `code`). Chạy thử là tham số dự kiến (`dry_run: true`), chưa có
// trong đặc tả: ghi ở chỗ thiếu API.
//
// Thao tác mẫu: đổi nhóm thuế của mọi sản phẩm trong một danh mục (vd hàng không thuộc diện giảm thuế
// GTGT 2% chuyển sang nhóm thuế suất chuẩn). Chạy thật đổi đúng sản phẩm của `sample/catalog.ts`.

import { getProduct, listProducts, updateProduct } from "./catalog";
import type { SampleOutcome } from "./settings";
import { isTaxCategory } from "./tax";

export type BulkOutcome = "ok" | "skipped" | "failed";

/** Kết quả của một bản ghi, như từng dòng của `GET /api/v1/kernel/jobs/{id}` (bước 51 P8). */
export interface BulkResult {
  id: string;
  name: string;
  outcome: BulkOutcome;
  /** Lý do bỏ qua / mã lỗi. */
  code: string | null;
}

export interface BulkPreview {
  resource: "catalog.products";
  action: "set_tax_category";
  filter: { category_id: string; tax_category: string };
  /** Số bản ghi khớp bộ lọc lúc chạy thử; chạy thật gửi lại số này (`expected_count`). */
  expected_count: number;
  counts: Record<BulkOutcome, number>;
  results: BulkResult[];
}

/** Một lần chạy thật (job), để màn hiện lần chạy gần đây. */
export interface BulkRun extends BulkPreview {
  id: string;
  status: "done";
  finished_at: string;
}

const KEY = "autoxide.sample.bulk.1";
type Holder = { [KEY]?: BulkRun[] };

function runs(): BulkRun[] {
  const holder = globalThis as Holder;
  holder[KEY] ??= [];
  return holder[KEY];
}

export function resetSampleBulk(): void {
  (globalThis as Holder)[KEY] = [];
}

function invalid(field: string, code: string): SampleOutcome<never> {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Unprocessable Entity",
      status: 422,
      code: "validation_failed",
      detail: "The request has invalid fields.",
      errors: [{ field, code, detail: code }],
    },
  };
}

/**
 * Thay bằng POST /api/v1/kernel/bulk/catalog.products/set_tax_category `{filter, dry_run: true}` (bước
 * 51 P8, chạy thử là dự kiến) khi core có. Không ghi gì: chỉ nói mỗi sản phẩm sẽ được đổi, bỏ qua (đã
 * ở nhóm đó) hay lỗi (đã lưu trữ thì không sửa được).
 */
export async function previewTaxChange(filter: {
  category_id: string;
  tax_category: string;
}): Promise<SampleOutcome<BulkPreview>> {
  if (!filter.category_id) return invalid("category_id", "required");
  if (!isTaxCategory(filter.tax_category)) return invalid("tax_category", "unknown");
  const page = await listProducts({ category_id: filter.category_id, limit: 500 });
  const results: BulkResult[] = page.data.map((p) => ({
    id: p.id,
    name: p.name,
    outcome:
      p.status === "archived"
        ? "failed"
        : p.tax_category === filter.tax_category
          ? "skipped"
          : "ok",
    code:
      p.status === "archived"
        ? "catalog.product_archived"
        : p.tax_category === filter.tax_category
          ? "already_set"
          : null,
  }));
  const counts: Record<BulkOutcome, number> = { ok: 0, skipped: 0, failed: 0 };
  for (const r of results) counts[r.outcome] += 1;
  return {
    ok: true,
    data: {
      resource: "catalog.products",
      action: "set_tax_category",
      filter,
      expected_count: results.length,
      counts,
      results,
    },
  };
}

/**
 * Thay bằng POST /api/v1/kernel/bulk/catalog.products/set_tax_category `{filter, expected_count}` kèm
 * `Idempotency-Key` (bước 51 P8) khi core có. Số khớp lúc chạy khác `expected_count` thì 409
 * `kernel.bulk_count_changed` (có người vừa thêm / bớt sản phẩm): chạy thử lại rồi mới chạy thật.
 */
export async function runTaxChange(input: {
  category_id: string;
  tax_category: string;
  expected_count: number;
}): Promise<SampleOutcome<BulkRun>> {
  const preview = await previewTaxChange(input);
  if (!preview.ok) return preview;
  if (preview.data.expected_count !== input.expected_count) {
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        code: "kernel.bulk_count_changed",
        detail: `${preview.data.expected_count} records match now, not ${input.expected_count}.`,
      },
    };
  }
  const results: BulkResult[] = [];
  for (const r of preview.data.results) {
    if (r.outcome !== "ok") {
      results.push(r);
      continue;
    }
    const found = await getProduct(r.id);
    if (!found) {
      results.push({ ...r, outcome: "failed", code: "catalog.product_not_found" });
      continue;
    }
    const p = found.data;
    const done = await updateProduct(p.id, {
      category_id: p.primary_category_id ?? input.category_id,
      tax_category: input.tax_category,
      allow_backorder: p.allow_backorder,
      lot_tracked: p.lot_tracked,
      serial_tracked: p.serial_tracked,
    });
    results.push(done.ok ? r : { ...r, outcome: "failed", code: done.problem.code });
  }
  const counts: Record<BulkOutcome, number> = { ok: 0, skipped: 0, failed: 0 };
  for (const r of results) counts[r.outcome] += 1;
  const run: BulkRun = {
    ...preview.data,
    counts,
    results,
    id: `bulk-${runs().length + 1}`,
    status: "done",
    finished_at: new Date().toISOString(),
  };
  runs().unshift(run);
  return { ok: true, data: run };
}

/** Thay bằng GET /api/v1/kernel/jobs?kind=kernel.bulk (bước 51 P8 / 52) khi core có. Mới nhất trước. */
export async function listBulkRuns(): Promise<{ data: BulkRun[] }> {
  return { data: structuredClone(runs().slice(0, 5)) };
}
