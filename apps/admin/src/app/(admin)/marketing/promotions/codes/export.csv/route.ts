import { notFound } from "next/navigation";
import { PROMOTIONS_CODES_MANAGE } from "@/lib/promotions";
import { cleanIds } from "@/lib/table";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { exportCodes } from "@/sample/promotions";

// "Xuất CSV" của tab Mã giảm giá (dữ liệu mẫu, W-006). Thay bằng GET
// /api/v1/promotions/promotions/{id}/codes/export (bước 43) khi core có: máy chủ của giao diện gọi
// core bằng token trong cookie và trả nguyên tệp core sinh. Ô bắt đầu bằng = + - @ đã được chặn.
export async function GET(request: Request) {
  if (!sampleDataEnabled()) notFound();
  if (!(await can(PROMOTIONS_CODES_MANAGE))) {
    return new Response("Forbidden", { status: 403 });
  }
  const search = new URL(request.url).searchParams;
  const promotion = search.get("promotion") ?? undefined;
  // `?ids=a,b`: chỉ các mã đã chọn (thao tác hàng loạt trên bảng).
  const ids = cleanIds(search.get("ids")?.split(",") ?? []);
  const { data } = await exportCodes(promotion, ids.length > 0 ? ids : null);
  return new Response(data.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.file_name}"`,
      "Cache-Control": "no-store",
    },
  });
}
