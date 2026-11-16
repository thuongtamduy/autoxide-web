import "server-only";

import { toVietnamInput } from "@/lib/catalog";
import { listUnits } from "@/sample/org";

// Phần dùng chung của các tab màn "Khuyến mại" (máy chủ).

/** Endpoint còn thiếu của bước 43, ghi vào nhãn "Dữ liệu mẫu" (W-006). */
export const ENDPOINTS_43 =
  "GET/POST /api/v1/promotions/promotions, /{id}/activate|pause|resume|end|cancel, /{id}/codes, /{id}/versions, /{id}/notice-export, /legal-limits, /notice-rules, /evaluate";

/** Nút tổ chức nơi tạo chương trình (trụ sở, vùng, cửa hàng). */
export async function orgOptions() {
  const { data } = await listUnits();
  return data
    .filter((u) => u.unit_type !== "warehouse")
    .map((u) => ({ value: u.id, label: u.name }));
}

/** Gợi ý khung giờ cho chương trình mới: từ 00:00 ngày mai tới 23:59 bảy ngày sau (giờ Việt Nam). */
export function defaultWindow(): { starts: string; ends: string } {
  const today = toVietnamInput(new Date().toISOString()).slice(0, 10);
  const day = (n: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  return { starts: `${day(1)}T00:00`, ends: `${day(7)}T23:59` };
}
