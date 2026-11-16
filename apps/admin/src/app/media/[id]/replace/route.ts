import { isUuid } from "@/lib/media";
import {
  coreUnreachable,
  problemResponse,
  relayJson,
  sameOrigin,
  streamBody,
} from "@/lib/media-route";
import { routeClient } from "@/lib/route-session";

// Thay nội dung một tệp, giữ id (`PUT /api/v1/media/{id}/content` của core), qua máy chủ của giao
// diện như khi tải lên. `If-Match` (ETag đã đọc) chuyển nguyên: người khác vừa sửa thì core trả 412.
export async function PUT(request: Request, ctx: RouteContext<"/media/[id]/replace">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return problemResponse(404, "media.item_not_found", "No such media item.");
  if (!(await sameOrigin())) {
    return problemResponse(403, "permission_denied", "Uploads come from the admin pages only.");
  }
  if (!request.body) {
    return problemResponse(422, "validation_failed", "The file is empty.");
  }
  const ifMatch = request.headers.get("if-match")?.slice(0, 200) ?? "";
  try {
    const { client, signedIn } = await routeClient();
    if (!signedIn) {
      return problemResponse(401, "unauthenticated", "Sign in again to upload files.");
    }
    const { data, error, response } = await client.PUT("/api/v1/media/{id}/content", {
      params: { path: { id }, header: { "If-Match": ifMatch } },
      ...streamBody(request),
    });
    return relayJson(response, data ?? error);
  } catch {
    return coreUnreachable();
  }
}
