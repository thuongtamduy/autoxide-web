// Mã đơn hàng mẫu dùng chung (W-006). Module `orders` của core chưa có (bước 45); màn Đơn hàng
// (`sample/orders.ts`, W-017) dựng đơn cho đúng các mã ở đây, và các phân hệ khác trỏ tới đơn (vận
// đơn, đối soát COD, khuyến mại đã giữ lượt, sổ cái) dùng đúng các mã này. Mã theo bản
// thiết kế: `BM-<năm 2 số><tháng 2 số>-<số thứ tự 4 số>`.
import { ORG } from "./catalog";

export interface OrderRef {
  id: string;
  number: string;
  /** Cửa hàng bán (nút của cây tổ chức mẫu). */
  org_id: string;
}

const uid = (n: number) => `01a1e000-0000-7000-8000-d1${String(n).padStart(10, "0")}`;

/**
 * Số đơn mẫu → nút bán (cửa hàng; đơn sàn Chợ Bếp Mộc nằm ở nút gốc vì sàn là bước 46). Thứ tự
 * tăng dần theo số; ID sinh theo vị trí, nên mọi chỗ khác trỏ tới đơn bằng mã (`orderId`), không chép
 * ID. Màn Tài chính trỏ tới 0350, 0398, 0405, 0409, 0411, 0412, 0416, 0417, 0419; màn Đơn hàng dựng
 * đủ đơn cho mọi mã ở đây (`sample/orders.ts`).
 */
const ORDERS: readonly [string, string][] = [
  ["BM-2611-0317", ORG.Q3],
  ["BM-2611-0331", ORG.Q3],
  ["BM-2611-0350", ORG.ROOT],
  ["BM-2611-0352", ORG.TD],
  ["BM-2611-0362", ORG.Q3],
  ["BM-2611-0367", ORG.TD],
  ["BM-2611-0371", ORG.TD],
  ["BM-2611-0379", ORG.Q3],
  ["BM-2611-0380", ORG.Q3],
  ["BM-2611-0386", ORG.TD],
  ["BM-2611-0388", ORG.CG],
  ["BM-2611-0390", ORG.ROOT],
  ["BM-2611-0395", ORG.Q3],
  ["BM-2611-0396", ORG.Q3],
  ["BM-2611-0398", ORG.Q3],
  ["BM-2611-0401", ORG.CG],
  ["BM-2611-0405", ORG.CG],
  ["BM-2611-0406", ORG.TD],
  ["BM-2611-0407", ORG.Q3],
  ["BM-2611-0408", ORG.Q3],
  ["BM-2611-0409", ORG.CG],
  ["BM-2611-0410", ORG.Q3],
  ["BM-2611-0411", ORG.TD],
  ["BM-2611-0412", ORG.Q3],
  ["BM-2611-0413", ORG.ROOT],
  ["BM-2611-0414", ORG.Q3],
  ["BM-2611-0415", ORG.CG],
  ["BM-2611-0416", ORG.TD],
  ["BM-2611-0417", ORG.ROOT],
  ["BM-2611-0418", ORG.Q3],
  ["BM-2611-0419", ORG.Q3],
];

/** Mọi đơn mẫu đã có ID cố định. */
export const ORDER_REFS: readonly OrderRef[] = ORDERS.map(([number, org_id], i) => ({
  id: uid(i + 1),
  number,
  org_id,
}));

/** Đơn mẫu theo mã đơn; `null` khi không có. */
export function orderByNumber(number: string): OrderRef | null {
  const key = number.trim().toUpperCase();
  return ORDER_REFS.find((o) => o.number === key) ?? null;
}

/** ID của một đơn mẫu theo mã (mã phải có trong `ORDER_REFS`). */
export function orderId(number: string): string {
  const found = orderByNumber(number);
  if (!found) throw new Error(`Không có đơn mẫu ${number}`);
  return found.id;
}

/** Mã đơn hợp lệ theo khuôn của bản thiết kế (dùng để kiểm ô "Mã đơn"). */
export const ORDER_NUMBER_PATTERN = /^BM-\d{4}-\d{4}$/;
