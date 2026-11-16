// Lớp CSS của nhãn trạng thái ở hai màn Đơn hàng và Cửa hàng (màu theo bản thiết kế: xanh = xong,
// vàng = cần để ý, đỏ = lỗi, tím = chờ người khác làm, xám = đã đóng).
import type { OrderStatus, PaymentStatus } from "@/lib/orders";
import type { PickupStatus, ReturnStatus } from "@/sample/orders";

export const ORDER_BADGE: Record<OrderStatus, string> = {
  pending_payment: "badge b-warn",
  awaiting_acceptance: "badge b-violet",
  confirmed: "badge b-info",
  preparing: "badge b-info",
  shipping: "badge b-sched",
  delivered: "badge b-ok",
  delivery_failed: "badge b-bad",
  completed: "badge b-ok",
  cancelled: "badge b-arch",
};

export const PAY_BADGE: Record<PaymentStatus, string> = {
  unpaid: "badge b-warn",
  cod_pending: "badge b-info",
  paid: "badge b-ok",
  partially_refunded: "badge b-warn",
  refunded: "badge b-arch",
};

export const RETURN_BADGE: Record<ReturnStatus, string> = {
  requested: "badge b-violet",
  approved: "badge b-info",
  rejected: "badge b-bad",
  received: "badge b-sched",
  refunded: "badge b-ok",
  closed: "badge b-arch",
};

export const PICKUP_BADGE: Record<PickupStatus, string> = {
  preparing: "badge b-info",
  ready: "badge b-violet",
  handed: "badge b-ok",
  expired_cancel: "badge b-arch",
};
