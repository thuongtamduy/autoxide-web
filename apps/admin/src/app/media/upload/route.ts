import { isUuid, safeFileName } from "@/lib/media";
import {
  coreUnreachable,
  problemResponse,
  relayJson,
  sameOrigin,
  streamBody,
} from "@/lib/media-route";
import { routeClient } from "@/lib/route-session";

// Tải một tệp lên thư viện media qua máy chủ của giao diện (`POST /api/v1/media` của core). Trình
// duyệt gửi nguyên tệp làm thân request (XMLHttpRequest, để có tiến độ); máy chủ chuyển dòng dữ
// liệu sang core kèm token lấy từ cookie, nên token không xuống trình duyệt. Core kiểm loại thật
// của tệp, kích thước, tên; lỗi trả nguyên dạng Problem để giao diện báo theo `code`.
export async function POST(request: Request) {
  if (!(await sameOrigin())) {
    return problemResponse(403, "permission_denied", "Uploads come from the admin pages only.");
  }
  if (!request.body) {
    return problemResponse(422, "validation_failed", "The file is empty.");
  }
  const url = new URL(request.url);
  const name = safeFileName(url.searchParams.get("name") ?? "");
  const folder = url.searchParams.get("folder_id");
  const tags = url.searchParams.get("tags")?.slice(0, 1100);
  try {
    const { client, signedIn } = await routeClient();
    if (!signedIn) {
      return problemResponse(401, "unauthenticated", "Sign in again to upload files.");
    }
    const { data, error, response } = await client.POST("/api/v1/media", {
      params: {
        query: {
          name,
          ...(isUuid(folder) ? { folder_id: folder } : {}),
          ...(tags ? { tags } : {}),
        },
      },
      ...streamBody(request),
    });
    return relayJson(response, data ?? error);
  } catch {
    return coreUnreachable();
  }
}
