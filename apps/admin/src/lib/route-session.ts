import "server-only";

import { type AutoxideClient, createAutoxideClient } from "@autoxide/sdk";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { callerInfo } from "./core";
import { coreUrl, secureCookies } from "./env";
import { refreshTokens } from "./refresh";
import { ACCESS_COOKIE, REFRESH_COOKIE, tokenCookies } from "./session";

// Phiên cho route handler nằm ngoài proxy (`/media/…`: ảnh qua máy chủ, tải tệp lên). Proxy chép
// thân request vào bộ nhớ và cắt ở 10 MB, nên tải lên không đi qua nó; route tự làm việc của proxy:
// access token hết thì đổi refresh token lấy cặp mới (qua `refreshTokens`, gộp request đồng thời)
// và đặt lại cookie. Không có phiên thì gọi core như khách: ảnh công khai vẫn tải được, như core.

/** Access token của người đang gọi; `undefined` khi chưa đăng nhập (hay phiên đã hết). */
export async function routeToken(): Promise<string | undefined> {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  if (access) return access;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return undefined;
  const result = await refreshTokens(refreshToken, {
    baseUrl: coreUrl(),
    forwardedFor: (await callerInfo()).forwardedFor,
  });
  if (!result.ok) {
    // Core không trả lời: giữ refresh token cho lần sau. Bị từ chối: phiên đã hết.
    if (result.status < 500) store.delete(REFRESH_COOKIE);
    return undefined;
  }
  for (const cookie of tokenCookies(result.tokens, secureCookies())) {
    store.set(cookie.name, cookie.value, cookie.options);
  }
  return result.tokens.access_token;
}

/** Client gọi core cho route handler: thay mặt người đăng nhập, hoặc như khách. */
export async function routeClient(): Promise<{ client: AutoxideClient; signedIn: boolean }> {
  const token = await routeToken();
  const client = createAutoxideClient({
    baseUrl: coreUrl(),
    accessToken: token,
    language: await getLocale(),
    ...(await callerInfo()),
  });
  return { client, signedIn: token !== undefined };
}
