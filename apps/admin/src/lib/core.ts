import "server-only";

import { ApiError, type AutoxideClient, createAutoxideClient, toApiError } from "@autoxide/sdk";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { adminTenantSetting, coreUrl } from "./env";
import { ACCESS_COOKIE } from "./session";
import { enteredTenant, sendsEntered, TENANT_COOKIE, tenantHeaders, WORK_COOKIE } from "./tenant";

/**
 * Thông tin về trình duyệt đang gọi trang này, gửi kèm mọi lời gọi core:
 * - `User-Agent`: core lưu nó cho phiên tạo ra (đăng nhập, đổi mật khẩu), không có thì danh sách
 *   phiên chỉ thấy máy chủ Next.js.
 * - `X-Forwarded-For`: địa chỉ của người dùng (reverse proxy phía trước ghi vào; không có proxy thì
 *   Next.js tự điền địa chỉ kết nối). Không có nó thì core thấy mọi người dùng là một địa chỉ — máy
 *   chủ này — và mọi người chung một hạn mức request (`AUTOXIDE_HTTP_RATE_LIMIT_PER_MINUTE`).
 */
export async function callerInfo(): Promise<{
  userAgent: string | undefined;
  forwardedFor: string | undefined;
}> {
  const request = await headers();
  return {
    userAgent: request.get("user-agent") ?? undefined,
    forwardedFor: request.get("x-forwarded-for") ?? undefined,
  };
}

/**
 * Khách đang vào làm việc (cookie `ax_work`, chọn ở bộ chọn góc trên trái); `null` khi làm việc ở
 * khách của chính mình.
 */
export async function currentEntry(): Promise<string | null> {
  return enteredTenant((await cookies()).get(WORK_COOKIE)?.value);
}

/**
 * Gắn `Autoxide-Tenant: <khách đang vào>` vào mọi lời gọi của `client` (trừ phần tài khoản của chính
 * mình, xem `sendsEntered`). Core cho vào khi người dùng có uỷ quyền hay quyền vào hỗ trợ còn hiệu
 * lực; hết thì trả 403 `tenant_mismatch`.
 */
export function withEntry(client: AutoxideClient, tenant: string | null): AutoxideClient {
  if (!tenant) return client;
  client.use({
    onRequest({ request }) {
      if (sendsEntered(new URL(request.url).pathname)) {
        request.headers.set("Autoxide-Tenant", tenant);
      }
      return request;
    },
  });
  return client;
}

/** Client gọi core thay mặt người đang đăng nhập (token lấy từ cookie). */
export async function coreClient(): Promise<AutoxideClient> {
  const store = await cookies();
  const client = createAutoxideClient({
    baseUrl: coreUrl(),
    accessToken: store.get(ACCESS_COOKIE)?.value,
    language: await getLocale(),
    ...(await callerInfo()),
  });
  return withEntry(client, enteredTenant(store.get(WORK_COOKIE)?.value));
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
    ...(await callerInfo()),
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
