import "server-only";

import {
  SHIPPING_CARRIERS_MANAGE,
  SHIPPING_COD_MANAGE,
  SHIPPING_READ,
  SHIPPING_SETTINGS_MANAGE,
  SHIPPING_SHIPMENTS_READ,
} from "@/lib/shipping";
import { listUnits } from "@/sample/org";
import { SAMPLE_PROVINCES } from "@/sample/shipping";

// Phần dùng chung của các tab màn "Vận chuyển" (máy chủ).

/** Endpoint còn thiếu của bước 44, ghi vào nhãn "Dữ liệu mẫu" (W-006). */
export const ENDPOINTS_44 =
  "GET/POST /api/v1/shipping/shipments, /{id}/book|cancel|split|status, /methods, /zones, /quote, /carrier-accounts, /cod/statements, /cod/discrepancies; /calendars (D-201)";

/** Tỉnh / thành để chọn (danh mục đơn vị hành chính là module `address` của bước 34). */
export function provinceOptions() {
  return SAMPLE_PROVINCES.map((p) => ({ value: p.code, label: p.name }));
}

/** Mọi nút của cây tổ chức mẫu. */
export async function unitOptions(filter?: (type: string) => boolean) {
  const { data } = await listUnits();
  return data
    .filter((u) => !filter || filter(u.unit_type))
    .map((u) => ({ value: u.id, label: u.name }));
}

/** Permission của từng tab (màn hiện khi xem được một trong số đó). */
export const TAB_PERMISSIONS = {
  shipments: SHIPPING_SHIPMENTS_READ,
  rates: [SHIPPING_READ, SHIPPING_SETTINGS_MANAGE],
  calendar: [SHIPPING_READ, SHIPPING_SETTINGS_MANAGE],
  cod: SHIPPING_COD_MANAGE,
  carriers: SHIPPING_CARRIERS_MANAGE,
} as const;
