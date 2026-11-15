// Lớp CSS của nhãn trạng thái ở hai màn Sản phẩm và Tồn kho (màu theo bảng trạng thái của bản
// thiết kế: xanh = ổn, vàng = cần để ý, đỏ = chặn, xám = đã xong / lưu trữ).
import type { DocumentStatus, PriceState, ProductStatus, TransferStatus } from "@/sample/catalog";
import type {
  CountStatus,
  LedgerStatus,
  LotStatus,
  PurchaseStatus,
  SerialStatus,
  StockStatus,
  TransferStatus as StockTransferStatus,
} from "@/sample/inventory";

export const PRODUCT_BADGE: Record<ProductStatus, string> = {
  draft: "badge b-draft",
  active: "badge b-ok",
  inactive: "badge b-warn",
  archived: "badge b-arch",
};

export const PRICE_BADGE: Record<PriceState, string> = {
  current: "badge b-ok",
  scheduled: "badge b-info",
  past: "badge b-arch",
};

export const DOCUMENT_BADGE: Record<DocumentStatus | "missing", string> = {
  valid: "badge b-ok",
  expiring: "badge b-warn",
  expired: "badge b-bad",
  missing: "badge b-bad",
};

export const IMPORT_BADGE: Record<TransferStatus, string> = {
  queued: "badge b-draft",
  running: "badge b-info",
  done: "badge b-ok",
  done_err: "badge b-warn",
  failed: "badge b-bad",
};

export const STOCK_BADGE: Record<StockStatus, string> = {
  ok: "badge b-ok",
  low: "badge b-warn",
  out: "badge b-bad",
  out_backorder: "badge b-bad",
};

export const TRANSFER_BADGE: Record<StockTransferStatus, string> = {
  draft: "badge b-draft",
  in_transit: "badge b-info",
  partially_received: "badge b-warn",
  received: "badge b-ok",
  closed: "badge b-arch",
  cancelled: "badge b-arch",
};

export const COUNT_BADGE: Record<CountStatus, string> = {
  open: "badge b-info",
  applied: "badge b-ok",
  cancelled: "badge b-arch",
};

export const LOT_BADGE: Record<LotStatus, string> = {
  fresh: "badge b-ok",
  expiring: "badge b-warn",
  expired: "badge b-bad",
};

export const SERIAL_BADGE: Record<SerialStatus, string> = {
  in_stock: "badge b-ok",
  sold: "badge b-info",
  returned: "badge b-warn",
  written_off: "badge b-arch",
};

export const PURCHASE_BADGE: Record<PurchaseStatus, string> = {
  draft: "badge b-draft",
  ordered: "badge b-info",
  partially_received: "badge b-warn",
  received: "badge b-ok",
  closed: "badge b-arch",
  cancelled: "badge b-arch",
};

export const LEDGER_BADGE: Record<LedgerStatus, string> = {
  queued: "badge b-draft",
  posted: "badge b-ok",
};
