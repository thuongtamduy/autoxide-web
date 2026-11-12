// Proxy (tên mới của middleware từ Next.js 16): chạy trước mỗi request tới trang.
//
// Việc duy nhất: giữ phiên còn sống. Access token đã hết (cookie `ax_access` hết hạn trước
// token) mà còn refresh token thì đổi lấy cặp mới, đặt cookie mới cho trình duyệt VÀ cho chính
// request này (để trang render ngay bằng token mới). Không còn gì thì về trang đăng nhập.
// Kiểm quyền thật vẫn do core làm ở từng lời gọi.
import { type NextRequest, NextResponse } from "next/server";
import { coreUrl, secureCookies } from "./lib/env";
import { refreshTokens } from "./lib/refresh";
import { ACCESS_COOKIE, REFRESH_COOKIE, tokenCookies } from "./lib/session";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.cookies.has(ACCESS_COOKIE)) {
    return NextResponse.next();
  }
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return toLogin(request);
  }
  const result = await refreshTokens(refreshToken, { baseUrl: coreUrl() });
  if (!result.ok) {
    // Core không trả lời: để trang tự báo lỗi, giữ refresh token cho lần sau.
    if (result.status >= 500) {
      return NextResponse.next();
    }
    const response = toLogin(request);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }
  const cookies = tokenCookies(result.tokens, secureCookies());
  for (const cookie of cookies) {
    request.cookies.set(cookie.name, cookie.value);
  }
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

function toLogin(request: NextRequest): NextResponse {
  const url = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") {
    url.searchParams.set("next", next);
  }
  return NextResponse.redirect(url);
}

export const config = {
  // Mọi trang trừ trang đăng nhập, tài nguyên tĩnh và file của Next.js.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
