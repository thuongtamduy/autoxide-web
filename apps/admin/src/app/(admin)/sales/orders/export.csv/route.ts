import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { ORDERS_READ, readFilters } from "@/lib/orders";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { exportOrdersCsv } from "@/sample/orders";
import { vietnamDay } from "@/sample/tax";

// "Xuất CSV theo bộ lọc" của màn Đơn hàng (dữ liệu mẫu, W-017). Thay bằng cơ chế xuất chung của bước 51
// (job, file qua link ký) khi core có. Ô bắt đầu bằng = + - @ đã được chặn để không thành công thức.
export async function GET(request: NextRequest) {
  if (!sampleDataEnabled()) notFound();
  if (!(await can(ORDERS_READ))) {
    return new Response("Forbidden", { status: 403 });
  }
  const filters = readFilters(Object.fromEntries(request.nextUrl.searchParams));
  const csv = await exportOrdersCsv(filters);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="don-hang-${vietnamDay()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
