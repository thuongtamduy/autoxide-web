import { isUuid } from "@/lib/media";
import { coreUnreachable, passHeaders, problemResponse, relayProblem } from "@/lib/media-route";
import { routeClient } from "@/lib/route-session";

// Nội dung một tệp media qua máy chủ của giao diện (`GET /api/v1/media/{id}/content` của core).
// Máy chủ gắn token lấy từ cookie, nên `<img src>` trong trình duyệt không cần token; chưa đăng
// nhập thì gọi như khách và chỉ tệp công khai tải được, đúng như core. `?download=1` để tải về.
// Range, If-Range, If-None-Match chuyển nguyên cho core (tua video, cache của trình duyệt).
export async function GET(request: Request, ctx: RouteContext<"/media/[id]/content">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return problemResponse(404, "media.item_not_found", "No such media item.");
  const url = new URL(request.url);
  const v = url.searchParams.get("v");
  const w = Number(url.searchParams.get("w"));
  const format = url.searchParams.get("format");
  const header: { Range?: string; "If-Range"?: string; "If-None-Match"?: string } = {};
  for (const name of ["Range", "If-Range", "If-None-Match"] as const) {
    const value = request.headers.get(name);
    if (value) header[name] = value;
  }
  try {
    const { client } = await routeClient();
    const answer = await client.GET("/api/v1/media/{id}/content", {
      params: {
        path: { id },
        query: {
          ...(v ? { v: v.slice(0, 64) } : {}),
          ...(Number.isInteger(w) && w > 0 ? { w } : {}),
          ...(format === "webp" ? { format } : {}),
        },
        header,
      },
      parseAs: "stream",
    });
    const { response } = answer;
    if (!response.ok && response.status !== 304) {
      return relayProblem(response.status, answer.error);
    }
    const out = passHeaders(response.headers);
    if (url.searchParams.get("download") === "1") {
      const disposition = out.get("content-disposition") ?? "attachment";
      out.set("content-disposition", disposition.replace(/^inline/, "attachment"));
    }
    const body = response.status === 304 ? null : (answer.data ?? null);
    return new Response(body as BodyInit | null, { status: response.status, headers: out });
  } catch {
    return coreUnreachable();
  }
}
