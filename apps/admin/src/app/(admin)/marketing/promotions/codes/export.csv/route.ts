import { notFound } from "next/navigation";
import { PROMOTIONS_CODES_MANAGE } from "@/lib/promotions";
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
  const promotion = new URL(request.url).searchParams.get("promotion") ?? undefined;
  const { data } = await exportCodes(promotion);
  return new Response(data.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.file_name}"`,
      "Cache-Control": "no-store",
    },
  });
}
