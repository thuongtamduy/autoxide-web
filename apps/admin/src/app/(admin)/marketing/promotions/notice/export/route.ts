import { notFound } from "next/navigation";
import { PROMOTIONS_COMPLIANCE } from "@/lib/promotions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { exportNotice } from "@/sample/promotions";

// "Xuất hồ sơ" của tab Thông báo Sở Công Thương (dữ liệu mẫu, W-006). Thay bằng POST
// /api/v1/promotions/promotions/{id}/notice-export?format=csv|json (bước 43) khi core có. Chỉ xuất
// dữ liệu: người nộp là con người, qua cổng dịch vụ công.
export async function GET(request: Request) {
  if (!sampleDataEnabled()) notFound();
  if (!(await can(PROMOTIONS_COMPLIANCE))) {
    return new Response("Forbidden", { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "json" ? "json" : "csv";
  const outcome = await exportNotice(params.get("id") ?? "", format);
  if (!outcome.ok) return new Response(outcome.problem.detail, { status: outcome.problem.status });
  return new Response(outcome.data.body, {
    headers: {
      "Content-Type": outcome.data.content_type,
      "Content-Disposition": `attachment; filename="${outcome.data.file_name}"`,
      "Cache-Control": "no-store",
    },
  });
}
