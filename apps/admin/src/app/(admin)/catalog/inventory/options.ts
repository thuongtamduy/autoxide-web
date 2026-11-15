import "server-only";

import { listPurchaseOrders, listReceipts, listSuppliers, warehouses } from "@/sample/inventory";

// Ô chọn dùng chung của các tab Tồn kho (máy chủ): kho và cửa hàng (nút `warehouse` / `store` của
// cây tổ chức mẫu), nhà cung cấp đang giao dịch, đơn đặt mua còn chờ hàng, phiếu nhập.
export async function inventoryOptions() {
  const [units, { data: suppliers }, { data: orders }, { data: receipts }] = await Promise.all([
    warehouses(),
    listSuppliers(),
    listPurchaseOrders(),
    listReceipts(),
  ]);
  return {
    warehouses: units.map((u) => ({ value: u.id, label: u.name })),
    suppliers: suppliers.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })),
    orders: orders
      .filter((o) => o.status === "ordered" || o.status === "partially_received")
      .map((o) => ({ value: o.id, label: `${o.number} · ${o.supplier_name}` })),
    receipts: receipts.map((r) => ({ value: r.number, label: `${r.number} · ${r.supplier_name}` })),
  };
}
