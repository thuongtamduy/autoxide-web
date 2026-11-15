import { coreUrl } from "@/lib/env";

// Ảnh công khai của core đi qua website: địa chỉ ảnh trong dữ liệu của core là đường dẫn
// `/api/v1/media/<id>/content?v=…` (cùng gốc với core), nên website chuyển tiếp đúng đường dẫn đó.
// Không gửi cookie hay token nào: chỉ ảnh công khai tải được (ảnh riêng tư core trả 401 / 404).
// Giữ `Cache-Control`, `ETag` của core (địa chỉ có phiên bản, cache được lâu).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASS = [
  "content-type",
  "content-length",
  "cache-control",
  "etag",
  "last-modified",
  "content-disposition",
];

export async function GET(request: Request, context: RouteContext<"/api/v1/media/[id]/content">) {
  const { id } = await context.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const search = new URL(request.url).search;
  const headers = new Headers();
  const match = request.headers.get("if-none-match");
  if (match) headers.set("If-None-Match", match);
  let upstream: Response;
  try {
    upstream = await fetch(`${coreUrl()}/api/v1/media/${id}/content${search}`, { headers });
  } catch {
    return new Response("The media service is not answering.", { status: 502 });
  }
  const out = new Headers({ "X-Content-Type-Options": "nosniff" });
  for (const name of PASS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.status === 304 ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  });
}
