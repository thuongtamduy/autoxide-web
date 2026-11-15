"use server";

// Server Action của các trang mở từ link trong thư. Gọi core như khách (`guest`): endpoint công
// khai, token trong link là bằng chứng. Token chỉ đi từ địa chỉ trang → form → máy chủ → core.
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { send } from "@/lib/action";
import { type FormState, nextDone, parseForm, problemState } from "@/lib/form";

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
