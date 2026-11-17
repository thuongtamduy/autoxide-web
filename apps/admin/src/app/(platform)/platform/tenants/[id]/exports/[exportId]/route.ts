import { isUuid } from "@/lib/media";
import { coreUnreachable, problemResponse, relayProblem } from "@/lib/media-route";
import { routeClient } from "@/lib/route-session";

// Tải tệp xuất dữ liệu của một khách (`GET /kernel/tenants/{id}/exports/{export_id}/content` của
// core) qua máy chủ của giao diện: máy chủ gắn token lấy từ cookie, trình duyệt không cần token và
// không cần gọi thẳng tới core. Core kiểm permission (`kernel.tenants.operate` hay
// `kernel.data.export`) và trả 409 `kernel.export_not_ready` khi tệp chưa xong hay đã bị xoá.
export async function GET(
  request: Request,
  ctx: RouteContext<"/platform/tenants/[id]/exports/[exportId]">,
) {
  const { id, exportId } = await ctx.params;
  if (!isUuid(id) || !isUuid(exportId)) {
    return problemResponse(404, "kernel.export_not_found", "No such export.");
  }
  try {
    const { client, signedIn } = await routeClient();
    if (!signedIn) {
      const back = encodeURIComponent(`/platform/tenants/${id}`);
      return Response.redirect(new URL(`/login?next=${back}`, request.url), 303);
    }
    const answer = await client.GET("/api/v1/kernel/tenants/{id}/exports/{export_id}/content", {
      params: { path: { id, export_id: exportId } },
      parseAs: "stream",
    });
    if (!answer.response.ok) return relayProblem(answer.response.status, answer.error);
    return new Response(answer.data as BodyInit | null, {
      headers: {
        "Content-Type": answer.response.headers.get("content-type") ?? "application/x-ndjson",
        "Content-Disposition": `attachment; filename="tenant-${id}-export-${exportId}.jsonl"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return coreUnreachable();
  }
}
