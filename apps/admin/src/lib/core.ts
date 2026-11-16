import "server-only";

import { ApiError, type AutoxideClient, createAutoxideClient, toApiError } from "@autoxide/sdk";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { adminTenantSetting, coreUrl } from "./env";
import { ACCESS_COOKIE } from "./session";
import { TENANT_COOKIE, tenantHeaders } from "./tenant";

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

/**
 * Client gọi core khi chưa đăng nhập (đăng nhập, bước mã, quên mật khẩu, cấu hình công khai). Core
 * chạy nhiều khách thì kèm khách của request (xem `tenant.ts`); core một khách bỏ qua header này.
 * Làm mới token không đi qua đây: refresh token tự mang khách.
 */
export async function anonymousClient(): Promise<AutoxideClient> {
  const client = createAutoxideClient({
    baseUrl: coreUrl(),
    language: await getLocale(),
    userAgent: await browserAgent(),
  });
  const request = await headers();
  const chosen = (await cookies()).get(TENANT_COOKIE)?.value;
  const extra = tenantHeaders(
    adminTenantSetting(),
    chosen,
    request.get("x-forwarded-host") ?? request.get("host"),
  );
  if (Object.keys(extra).length > 0) {
    client.use({
      onRequest({ request }) {
        for (const [name, value] of Object.entries(extra)) request.headers.set(name, value);
        return request;
      },
    });
  }
  return client;
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

/**
 * Như `load`, kèm `ETag` của bản ghi: gửi lại trong `If-Match` khi sửa, để core từ chối (412)
 * thay vì ghi đè thay đổi của người khác vừa lưu giữa chừng.
 */
export async function loadTagged<T>(
  call: (client: AutoxideClient) => Promise<Result<T>>,
): Promise<{ data: T; etag: string | null }> {
  const { data, error, response } = await call(await coreClient());
  if (data !== undefined) {
    return { data, etag: response.headers.get("etag") };
  }
  if (response.status === 401) {
    redirect("/login");
  }
  throw toApiError(response, error);
}

export function isNotFound(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 404;
}

export function isForbidden(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 403;
}
