import "server-only";

// Giao diện sáng / tối theo tài khoản: cookie `ax_theme` vẫn quyết định lúc vẽ trang (kể cả trang đăng
// nhập, không cần gọi core), còn lựa chọn được ghi thêm thành cờ `ui.theme` của core (`/me/flags`,
// D-207). Đăng nhập ở máy khác thì đọc cờ đó và đặt lại cookie, nên lựa chọn đi theo người dùng.
// Lỗi ở đây không bao giờ chặn việc đổi giao diện hay đăng nhập.
import { createAutoxideClient } from "@autoxide/sdk";
import { callerInfo, coreClient } from "./core";
import { coreUrl } from "./env";
import { isTheme, THEME_COOKIE, type Theme } from "./theme";

export const THEME_FLAG = "ui.theme";

type CookieStore = {
  set: (
    name: string,
    value: string,
    options: { path: string; sameSite: "lax"; maxAge: number },
  ) => unknown;
  delete: (name: string) => unknown;
};

/** Đặt cookie theo lựa chọn (giữ một năm); "theo máy" thì xoá cookie để CSS theo cài đặt của máy. */
export function applyThemeCookie(store: CookieStore, theme: Theme): void {
  if (theme === "system") store.delete(THEME_COOKIE);
  else store.set(THEME_COOKIE, theme, { path: "/", sameSite: "lax", maxAge: 365 * 24 * 60 * 60 });
}

/** Ghi lựa chọn lên core cho người đang đăng nhập (chưa đăng nhập thì core trả 401, bỏ qua). */
export async function saveThemeFlag(theme: Theme): Promise<void> {
  try {
    const client = await coreClient();
    await client.PUT("/api/v1/me/flags/{key}", {
      params: { path: { key: THEME_FLAG } },
      body: { value: theme },
    });
  } catch {
    // Core không trả lời: cookie vẫn đổi trên máy này.
  }
}

/** Lựa chọn đã lưu ở core của người vừa đăng nhập (dùng access token mới); `null` khi chưa có. */
export async function savedTheme(accessToken: string): Promise<Theme | null> {
  try {
    const client = createAutoxideClient({
      baseUrl: coreUrl(),
      accessToken,
      forwardedFor: (await callerInfo()).forwardedFor,
    });
    const { data } = await client.GET("/api/v1/me/flags", { params: { query: { prefix: "ui." } } });
    const value = data?.data.find((flag) => flag.key === THEME_FLAG)?.value;
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}
