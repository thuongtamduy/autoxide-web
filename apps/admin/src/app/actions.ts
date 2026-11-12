"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/i18n/locales";
import { anonymousClient } from "@/lib/core";
import { ACCESS_COOKIE, MFA_COOKIE, REFRESH_COOKIE } from "@/lib/session";

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
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, MFA_COOKIE]) {
    store.delete(name);
  }
  redirect("/login");
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
