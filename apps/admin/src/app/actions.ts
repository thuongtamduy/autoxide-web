"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/i18n/locales";
import { anonymousClient } from "@/lib/core";
import { SELLER_PREVIEW_COOKIE } from "@/lib/market";
import { REFRESH_COOKIE, SESSION_COOKIES } from "@/lib/session";
import { isTheme } from "@/lib/theme";
import { applyThemeCookie, saveThemeFlag } from "@/lib/theme-sync";

/** Đăng xuất: kết thúc phiên ở core rồi xoá cookie. */
export async function signOut(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      const client = await anonymousClient();
      await client.POST("/api/v1/auth/logout", { body: { refresh_token: refreshToken } });
    } catch {
      // Core không trả lời: vẫn xoá cookie; refresh token tự hết hạn ở core.
    }
  }
  for (const name of SESSION_COOKIES) {
    store.delete(name);
  }
  // "Xem như người bán" (W-018) gắn với phiên này, không để lại cho người đăng nhập sau.
  store.delete(SELLER_PREVIEW_COOKIE);
  redirect("/login");
}

/**
 * Đổi giao diện sáng / tối / theo máy (cookie giữ một năm; "theo máy" thì xoá cookie), và ghi lựa chọn
 * lên core theo tài khoản để máy khác nhận khi đăng nhập.
 */
export async function setTheme(formData: FormData): Promise<void> {
  const theme = formData.get("theme");
  if (!isTheme(theme)) {
    return;
  }
  applyThemeCookie(await cookies(), theme);
  await saveThemeFlag(theme);
}

/** Đổi ngôn ngữ giao diện (cookie giữ một năm). */
export async function setLanguage(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (isLocale(locale)) {
    (await cookies()).set(LOCALE_COOKIE, locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60,
    });
  }
}
