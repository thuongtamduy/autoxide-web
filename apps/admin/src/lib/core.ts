import "server-only";

import { ApiError, type AutoxideClient, createAutoxideClient, toApiError } from "@autoxide/sdk";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { coreUrl } from "./env";
import { ACCESS_COOKIE } from "./session";

/**
 * `User-Agent` của trình duyệt đang gọi trang này. Gửi kèm mọi lời gọi core: core lưu nó cho
 * phiên tạo ra (đăng nhập, đổi mật khẩu), không có thì danh sách phiên chỉ thấy máy chủ Next.js.
 */
async function browserAgent(): Promise<string | undefined> {
  return (await headers()).get("user-agent") ?? undefined;
}

/** Client gọi core thay mặt người đang đăng nhập (token lấy từ cookie). */
export async function coreClient(): Promise<AutoxideClient> {
  const store = await cookies();
  return createAutoxideClient({
    baseUrl: coreUrl(),
    accessToken: store.get(ACCESS_COOKIE)?.value,
    language: await getLocale(),
    userAgent: await browserAgent(),
  });
}

/** Client gọi core như khách (đăng nhập, làm mới token). */
export async function anonymousClient(): Promise<AutoxideClient> {
  return createAutoxideClient({
    baseUrl: coreUrl(),
    language: await getLocale(),
    userAgent: await browserAgent(),
  });
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * Lấy dữ liệu từ core cho một trang. Chưa đăng nhập (401) thì về trang đăng nhập; lỗi khác
 * ném `ApiError` để trang tự xử (403, 404) hoặc rơi vào `error.tsx`.
 */
export async function load<T>(call: (client: AutoxideClient) => Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await call(await coreClient());
  if (data !== undefined) {
    return data;
  }
  if (response.status === 401) {
    redirect("/login");
  }
  throw toApiError(response, error);
}

export function isForbidden(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 403;
}
