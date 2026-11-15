// Lớp CSS của nhãn trạng thái ở màn Vận chuyển (màu theo bảng trạng thái của bản thiết kế: xanh = xong,
// vàng = cần để ý, đỏ = lỗi / chặn, tím = chờ người khác làm, xám = đã đóng).
import type {
  CarrierAccount,
  CodDiscrepancy,
  LineMatch,
  ShipmentStatus,
  StatementStatus,
} from "@/sample/shipping";

export const SHIPMENT_BADGE: Record<ShipmentStatus, string> = {
  pending: "badge b-warn",
  booking: "badge b-info",
  ready_to_ship: "badge b-violet",
  picked_up: "badge b-info",
  in_transit: "badge b-sched",
  out_for_delivery: "badge b-sched",
  delivered: "badge b-ok",
  delivery_failed: "badge b-bad",
  returning: "badge b-warn",
  returned: "badge b-arch",
  ready_for_pickup: "badge b-violet",
  picked_up_by_buyer: "badge b-ok",
  cancelled: "badge b-arch",
  lost: "badge b-bad",
};

export const STATEMENT_BADGE: Record<StatementStatus, string> = {
  imported: "badge b-info",
  reconciled: "badge b-ok",
  has_mismatch: "badge b-bad",
};

export const MATCH_BADGE: Record<LineMatch, string> = {
  matched: "badge b-ok",
  amount_mismatch: "badge b-bad",
  unknown_tracking: "badge b-bad",
  not_delivered: "badge b-warn",
};

export const DISCREPANCY_BADGE: Record<CodDiscrepancy["status"], string> = {
  open: "badge b-warn",
  resolved: "badge b-ok",
};

export const CARRIER_BADGE: Record<CarrierAccount["check_status"] | "off", string> = {
  ok: "badge b-ok",
  error: "badge b-bad",
  unknown: "badge b-draft",
  off: "badge b-arch",
};
