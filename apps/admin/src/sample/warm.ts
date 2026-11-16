// Dựng sẵn các kho dữ liệu mẫu lúc máy chủ khởi động (W-020), khi bật dữ liệu mẫu. Số đếm trên menu đọc
// dữ liệu mẫu của nhiều phân hệ ở mọi trang; không dựng sẵn thì trang đầu tiên sau khi khởi động phải
// dựng hết các kho (đơn hàng, sàn, tài chính…) và chậm hẳn. Kho vẫn nằm trong bộ nhớ, như trước.
import { sampleDataEnabled } from "./index";

export async function warmSampleData(): Promise<void> {
  if (!sampleDataEnabled()) return;
  const [agent, compliance, finance, invoices, inventory, market, orders, shipping, tax, catalog] =
    await Promise.all([
      import("./agent"),
      import("./compliance"),
      import("./finance"),
      import("./finance-invoices"),
      import("./inventory"),
      import("./market"),
      import("./orders"),
      import("./shipping"),
      import("./tax"),
      import("./catalog"),
    ]);
  await Promise.all([
    agent.listApprovals(),
    compliance.listComplianceWebsites(),
    compliance.listKycProfiles(),
    finance.financeCounts(),
    invoices.invoiceCounts(),
    inventory.inventoryStats(),
    market.listDisputes(),
    orders.ordersState(),
    shipping.codStats(),
    tax.listTaxRates(),
    catalog.productStats(),
  ]);
}
