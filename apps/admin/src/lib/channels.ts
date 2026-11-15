// Phần dùng chung (không đọc dữ liệu) của màn Kênh bán: permission dự kiến của đặc tả 48
// (`docs/steps/48-channels.md` của core). Hàm thuần, chạy được ở cả máy chủ và trình duyệt.

export const CHANNELS_READ = "channels.read";
export const CHANNELS_MANAGE = "channels.manage";
export const CHANNELS_ORDERS_MANAGE = "channels.orders.manage";
export const CHANNELS_FINANCE_READ = "channels.finance.read";
export const CHANNELS_FINANCE_MANAGE = "channels.finance.manage";
/** Báo cáo theo kênh cần thêm quyền đọc báo cáo của `orders` (đặc tả 48). */
export const ORDERS_REPORTS_READ = "orders.reports.read";

/** Phần vạn thành phần trăm để hiện (`800` → "8"; `-250` → "−2,5" theo dấu thập phân của ngôn ngữ). */
export function percentText(bp: number, locale: string): string {
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    Math.abs(bp) / 100,
  );
  return bp < 0 ? `−${value}` : value;
}
