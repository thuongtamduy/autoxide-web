import { notFound } from "next/navigation";
import { CATALOG_EXPORT } from "@/lib/catalog";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { exportProducts } from "@/sample/catalog";

// "Xuất CSV" của màn Sản phẩm (dữ liệu mẫu, W-006). Thay bằng POST /api/v1/catalog/exports rồi
// GET /exports/{id}/content (bước 41) khi core có: máy chủ của giao diện gọi core bằng token trong
// cookie và trả nguyên tệp core sinh. Ô bắt đầu bằng = + - @ đã được chặn để không thành công thức.
export async function GET() {
  if (!sampleDataEnabled()) notFound();
  if (!(await can(CATALOG_EXPORT))) {
    return new Response("Forbidden", { status: 403 });
  }
  const { data } = await exportProducts();
  return new Response(data.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.transfer.file_name}"`,
      "Cache-Control": "no-store",
    },
  });
}
