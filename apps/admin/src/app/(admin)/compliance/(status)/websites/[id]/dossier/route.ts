import { LEGAL_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { getDossier } from "@/sample/compliance";

// Tải bộ hồ sơ Bộ Công Thương của một website (dữ liệu mẫu, W-012). Thay bằng
// GET /api/v1/compliance/websites/{id}/dossier (bước 37) khi core có: route này khi đó gọi core
// bằng token trong cookie rồi trả nguyên tệp, như `/marketing/forms/{id}/export`.
export async function GET(
  _request: Request,
  context: RouteContext<"/compliance/websites/[id]/dossier">,
) {
  if (!sampleDataEnabled()) return new Response(null, { status: 404 });
  if (!(await can(LEGAL_READ))) return new Response(null, { status: 403 });
  const { id } = await context.params;
  const dossier = await getDossier(id);
  if (!dossier.ok) {
    return Response.json(dossier.problem, {
      status: dossier.problem.status,
      headers: { "Content-Type": "application/problem+json" },
    });
  }
  return new Response(JSON.stringify(dossier.data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="dossier-${id}.json"`,
    },
  });
}
