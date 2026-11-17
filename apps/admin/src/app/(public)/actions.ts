"use server";

// Server Action của các trang mở từ link trong thư. Gọi core như khách (`guest`): endpoint công
// khai, token trong link là bằng chứng. Token chỉ đi từ địa chỉ trang → form → máy chủ → core.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { send } from "@/lib/action";
import { secureCookies } from "@/lib/env";
import { type FormState, nextDone, parseForm, problemState } from "@/lib/form";
import { mfaCookie, tokenCookies } from "@/lib/session";

/** Xác minh email bằng token trong thư. Chạy khi người dùng bấm nút, không chạy lúc mở trang. */
export async function confirmEmail(state: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const result = await send(
    (client) => client.POST("/api/v1/auth/email-verification/confirm", { body: { token } }),
    { guest: true },
  );
  if (!result.ok) return problemState(result.problem, []);
  return { done: nextDone(state), values: { email: result.data.data.email } };
}

/**
 * Báo "không phải tôi đổi email" bằng token trong thư gửi tới địa chỉ cũ (core bước 32, D-250). Core khoá
 * tài khoản trước kẻ đã đổi (đăng xuất mọi nơi, bỏ mật khẩu, API key, passkey, xác thực hai bước) và, nếu
 * địa chỉ cũ còn trống, trả email về đó kèm thư đặt mật khẩu mới.
 */
export async function reportEmailChange(state: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const result = await send(
    (client) => client.POST("/api/v1/auth/email-change/report", { body: { token } }),
    { guest: true },
  );
  if (!result.ok) return problemState(result.problem, []);
  return { done: nextDone(state) };
}

const ForgotForm = z.object({ email: z.string().trim().min(1) });

/**
 * Xin thư đặt lại mật khẩu. Core luôn trả 202 dù email có tài khoản hay không; giao diện cũng
 * luôn báo cùng một câu, không lộ ai có tài khoản.
 */
export async function requestReset(state: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("public.forgot");
  const email = String(formData.get("email") ?? "");
  const input = parseForm(ForgotForm, formData, t("required"), { email: t("required") });
  if (!input.ok) return { fields: input.fields, values: { email } };
  const result = await send(
    (client) => client.POST("/api/v1/auth/password-reset", { body: input.data }),
    { guest: true },
  );
  if (!result.ok) return { ...problemState(result.problem, ["email"]), values: { email } };
  return { done: nextDone(state), values: { email: input.data.email } };
}

const ResetForm = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  repeat: z.string().min(1),
});

/** Đặt mật khẩu mới bằng token trong thư. Core đăng xuất tài khoản ở mọi nơi. */
export async function confirmReset(state: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("public.reset");
  const input = parseForm(ResetForm, formData, t("required"), {
    password: t("required"),
    repeat: t("repeatRequired"),
  });
  if (!input.ok) return { fields: input.fields };
  if (input.data.password !== input.data.repeat) {
    return { fields: { repeat: t("mismatch") } };
  }
  const result = await send(
    (client) =>
      client.POST("/api/v1/auth/password-reset/confirm", {
        body: { token: input.data.token, password: input.data.password },
      }),
    { guest: true },
  );
  if (!result.ok) return problemState(result.problem, ["password"]);
  return { done: nextDone(state) };
}

/**
 * Nhận lời mời bằng tài khoản mới (`POST /auth/invitations/accept`, không cần đăng nhập): tên, mật
 * khẩu (không bắt buộc: bỏ trống thì sau này đăng nhập bằng link hay thêm passkey). Core tạo tài
 * khoản (email coi như đã xác minh), trả token của phiên mới → cookie như đăng nhập, rồi vào trang
 * quản trị. Email đã có tài khoản: core trả `auth.invitation_sign_in_required`, trang chỉ đường
 * đăng nhập rồi nhận.
 */
export async function acceptInvitation(state: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const result = await send(
    (client) =>
      client.POST("/api/v1/auth/invitations/accept", {
        body: { token, ...(name ? { name } : {}), ...(password ? { password } : {}) },
      }),
    { guest: true },
  );
  if (!result.ok) {
    return { ...problemState(result.problem, ["name", "password"]), values: { name } };
  }
  const tokens = result.data.data.tokens;
  if (tokens) {
    const store = await cookies();
    for (const cookie of tokenCookies(tokens, secureCookies())) {
      store.set(cookie.name, cookie.value, cookie.options);
    }
    redirect("/?welcome=1");
  }
  return { done: nextDone(state) };
}

const LinkForm = z.object({ email: z.string().trim().min(1) });

/**
 * Xin link đăng nhập qua email (`POST /auth/login/link`). Core luôn trả 202 như nhau dù email có
 * tài khoản hay không; giao diện cũng luôn báo cùng một câu. Máy chủ chưa bật tính năng thì core
 * báo `auth.login_link_disabled`.
 */
export async function requestLoginLink(state: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("public.link");
  const email = String(formData.get("email") ?? "");
  const input = parseForm(LinkForm, formData, t("required"), { email: t("required") });
  if (!input.ok) return { fields: input.fields, values: { email } };
  const result = await send(
    (client) => client.POST("/api/v1/auth/login/link", { body: { email: input.data.email } }),
    { guest: true },
  );
  if (!result.ok) return { ...problemState(result.problem, ["email"]), values: { email } };
  return { done: nextDone(state), values: { email: input.data.email } };
}

/**
 * Đăng nhập bằng token trong link (`POST /auth/login/link/confirm`). Chạy khi người dùng bấm nút,
 * không chạy lúc mở trang: máy quét thư mở mọi link không làm mất token dùng một lần.
 */
export async function confirmLoginLink(_state: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const result = await send(
    (client) => client.POST("/api/v1/auth/login/link/confirm", { body: { token } }),
    { guest: true },
  );
  if (!result.ok) return problemState(result.problem, []);
  const store = await cookies();
  const data = result.data.data;
  if ("mfa_token" in data) {
    // Tài khoản bật xác thực hai bước: core trả 202 kèm `mfa_token` như đăng nhập bằng mật khẩu.
    // Trang đăng nhập mở thẳng bước nhập mã khi có cookie này.
    const cookie = mfaCookie(data, secureCookies());
    store.set(cookie.name, cookie.value, cookie.options);
    redirect("/login");
  }
  for (const cookie of tokenCookies(data, secureCookies())) {
    store.set(cookie.name, cookie.value, cookie.options);
  }
  redirect("/");
}
