import "server-only";

import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { send } from "./action";
import type { ConfirmMethod, ConfirmMethods } from "./confirm";
import { load } from "./core";
import { type FormState, problemState } from "./form";
import { PASSKEY_COOKIE } from "./session";
import { getMe } from "./viewer";

/** Cách xác nhận tài khoản đang đăng nhập dùng được, đọc một lần cho mỗi request. */
export const loadConfirmMethods = cache(async (): Promise<ConfirmMethods> => {
  const [me, mfa, passkeys] = await Promise.all([
    getMe(),
    load((c) => c.GET("/api/v1/auth/me/mfa")),
    load((c) => c.GET("/api/v1/auth/me/passkeys", { params: { query: { limit: 1 } } })),
  ]);
  return {
    password: me.has_password,
    totp: mfa.data.totp_enabled,
    passkey: passkeys.data.length > 0,
  };
});

/** Phần xác nhận của thân request gửi core: mật khẩu, hay `reauth_token` vừa xin được. */
export type ProofBody = { current_password: string } | { reauth_token: string };

/**
 * Đổi bằng chứng người dùng đưa (ô `confirm` của form) thành phần thân request của lệnh nhạy cảm.
 * Mật khẩu gửi thẳng như trước. Mã của app xác thực hay passkey thì xin `reauth_token` dùng một lần
 * (`POST /auth/me/reauth`) — cách để tài khoản không có mật khẩu (chỉ passkey) làm lệnh nhạy cảm.
 */
export async function proof(
  formData: FormData,
): Promise<{ ok: true; body: ProofBody } | { ok: false; state: FormState }> {
  const t = await getTranslations("account.confirm");
  const method = String(formData.get("confirm") ?? "password") as ConfirmMethod;
  if (method === "password") {
    const password = String(formData.get("current_password") ?? "");
    return password
      ? { ok: true, body: { current_password: password } }
      : { ok: false, state: { fields: { current_password: t("passwordRequired") } } };
  }
  let body: Parameters<typeof reauth>[0];
  if (method === "totp") {
    const code = String(formData.get("totp_code") ?? "").trim();
    if (!code) return { ok: false, state: { fields: { totp_code: t("codeRequired") } } };
    body = { method: "totp", totp_code: code };
  } else {
    const store = await cookies();
    const ceremony = store.get(PASSKEY_COOKIE)?.value;
    store.delete(PASSKEY_COOKIE);
    let credential: unknown = null;
    try {
      credential = JSON.parse(String(formData.get("passkey_credential") ?? ""));
    } catch {
      credential = null;
    }
    if (!ceremony || typeof credential !== "object" || credential === null) {
      return {
        ok: false,
        state: { error: t("passkeyExpired"), code: "auth.invalid_passkey_ceremony" },
      };
    }
    body = {
      method: "passkey",
      passkey_ceremony_id: ceremony,
      passkey_credential: credential as Record<string, never>,
    };
  }
  return reauth(body);
}

async function reauth(body: {
  method: "totp" | "passkey";
  totp_code?: string;
  passkey_ceremony_id?: string;
  passkey_credential?: Record<string, never>;
}): Promise<{ ok: true; body: ProofBody } | { ok: false; state: FormState }> {
  const result = await send((client) => client.POST("/api/v1/auth/me/reauth", { body }));
  if (!result.ok) {
    return {
      ok: false,
      state: problemState(result.problem, ["totp_code"], { "auth.invalid_mfa_code": "totp_code" }),
    };
  }
  const token = result.data.data.reauth_token;
  if (!token)
    return { ok: false, state: { error: "No confirmation token.", code: "auth.reauth_failed" } };
  return { ok: true, body: { reauth_token: token } };
}
