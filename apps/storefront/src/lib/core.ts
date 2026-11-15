import "server-only";

import { type AutoxideClient, createAutoxideClient, toApiError } from "@autoxide/sdk";
import { headers } from "next/headers";
import { coreUrl } from "./env";

// Website công khai chỉ gọi endpoint công khai của core (`…/public/…`), từ máy chủ Next.js, như
// khách: không có token nào, trình duyệt không bao giờ gọi core trực tiếp (trừ ảnh, đi qua route
// `/api/v1/media/…` của website). Mọi lời gọi gửi `Accept-Language` theo ngôn ngữ của trang để
// `detail` của lỗi đúng ngôn ngữ.

/**
 * Client gọi core như khách, theo ngôn ngữ của trang. `forwardedFor`: chuỗi `X-Forwarded-For` của
 * request người đọc (lệnh ghi công khai: bình luận, bản tin, token chống spam), để core giới hạn
 * theo địa chỉ của người đọc thay vì của máy chủ website — core chỉ tin header này khi máy chủ
 * website nằm trong `AUTOXIDE_HTTP_TRUSTED_PROXIES` (README).
 */
export function publicClient(locale: string, forwardedFor?: string | null): AutoxideClient {
  const client = createAutoxideClient({ baseUrl: coreUrl(), language: locale });
  if (forwardedFor) {
    client.use({
      onRequest({ request }) {
        request.headers.set("X-Forwarded-For", forwardedFor.slice(0, 500));
        return request;
      },
    });
  }
  return client;
}

/** `X-Forwarded-For` của request đang xử lý (Server Action), kèm địa chỉ do proxy phía trước báo. */
export async function visitorChain(): Promise<string | null> {
  const incoming = await headers();
  return incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip");
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * Lấy dữ liệu công khai. Không có (404) thì `null` để trang tự hiện "không tìm thấy" hay dùng
 * phần thay thế; lỗi khác ném `ApiError` (trang rơi vào `error.tsx`).
 */
export async function loadPublic<T>(
  locale: string,
  call: (client: AutoxideClient) => Promise<Result<T>>,
): Promise<T | null> {
  const { data, error, response } = await call(publicClient(locale));
  if (data !== undefined) return data;
  if (response.status === 404) return null;
  throw toApiError(response, error);
}

/**
 * Như `loadPublic`, nhưng mọi lỗi (core tắt, mạng hỏng, 5xx) cũng thành `null`: cho phần phụ của
 * trang (menu, bài viết ở trang chủ, bản tin ở chân trang) — hỏng phần phụ không làm hỏng trang.
 */
export async function loadOptional<T>(
  locale: string,
  call: (client: AutoxideClient) => Promise<Result<T>>,
): Promise<T | null> {
  try {
    return await loadPublic(locale, call);
  } catch {
    return null;
  }
}
