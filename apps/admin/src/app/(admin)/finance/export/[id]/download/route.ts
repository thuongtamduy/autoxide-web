import { notFound } from "next/navigation";
import { INVOICES_EXPORT } from "@/lib/finance";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { exportFile } from "@/sample/finance-invoices";

// "Tải về" một bản xuất kế toán (dữ liệu mẫu, W-006, W-016). Thay bằng GET
// /api/v1/invoices/exports/{id}/download (bước 36) khi core có: máy chủ của giao diện gọi core bằng
// token trong cookie và trả nguyên tệp core sinh. CSV UTF-8 có BOM, ô bắt đầu bằng = + - @ đã chặn.
export async function GET(
  _request: Request,
  context: RouteContext<"/finance/export/[id]/download">,
) {
  if (!sampleDataEnabled()) notFound();
  if (!(await can(INVOICES_EXPORT))) {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await context.params;
  const outcome = await exportFile(id);
  if (!outcome.ok) {
    return Response.json(outcome.problem, {
      status: outcome.problem.status,
      headers: { "Content-Type": "application/problem+json" },
    });
  }
  return new Response(outcome.data.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${outcome.data.file_name}"`,
      "Cache-Control": "no-store",
    },
  });
}
