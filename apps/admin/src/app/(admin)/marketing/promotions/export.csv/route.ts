import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { PROMOTIONS_READ } from "@/lib/promotions";
import { cleanIds } from "@/lib/table";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { exportPromotions } from "@/sample/promotions";

// "Xuất CSV" các chương trình đã chọn trên bảng Chương trình (dữ liệu mẫu, W-006). Core chưa có
// endpoint xuất danh sách chương trình (bước 43): khi có thì máy chủ của giao diện gọi core bằng
// token trong cookie và trả nguyên tệp core sinh. Ô bắt đầu bằng = + - @ đã được chặn.
export async function GET(request: Request) {
  if (!sampleDataEnabled()) notFound();
  if (!(await can(PROMOTIONS_READ))) {
    return new Response("Forbidden", { status: 403 });
  }
  // `?ids=a,b`: chỉ các chương trình đã chọn (thao tác hàng loạt trên bảng).
  const ids = cleanIds(new URL(request.url).searchParams.get("ids")?.split(",") ?? []);
  const { data } = await exportPromotions(ids.length > 0 ? ids : null, await getLocale());
  return new Response(data.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.file_name}"`,
      "Cache-Control": "no-store",
    },
  });
}
