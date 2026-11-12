"use server";

import { toApiError } from "@autoxide/sdk";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { anonymousClient } from "@/lib/core";
import { secureCookies } from "@/lib/env";
import { MFA_COOKIE, mfaCookie, safeNext, tokenCookies } from "@/lib/session";

/** Trạng thái form đăng nhập, giữ giữa các lần gửi. */
export type LoginState = {
  step: "password" | "mfa";
  /** Câu báo lỗi cho người dùng (đã theo ngôn ngữ). */
  error?: string;
  /** `code` lỗi của core, để test và giao diện rẽ nhánh. */
  code?: string;
  /** Email vừa gửi, điền lại vào form sau khi báo lỗi (React đặt lại form sau mỗi lần gửi). */
  email?: string;
};

const PasswordForm = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
  next: z.string().optional(),
});

const CodeForm = z.object({
  code: z.string().trim().min(1),
  next: z.string().optional(),
});

function fields(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

/** Bước 1: email và mật khẩu. */
async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const t = await getTranslations("login");
  const input = PasswordForm.safeParse(fields(formData));
  if (!input.success) {
    const email = formData.get("email");
    return {
      step: "password",
      error: t("invalidInput"),
      code: "validation_failed",
      ...(typeof email === "string" ? { email } : {}),
    };
  }
  const store = await cookies();
  let result: Awaited<ReturnType<typeof callLogin>>;
  try {
    result = await callLogin(input.data.email, input.data.password);
  } catch {
    return {
      step: "password",
      error: t("unreachable"),
      code: "core_unreachable",
      email: input.data.email,
    };
  }
  const { data, error, response } = result;
  if (response.status === 202 && data && "mfa_token" in data.data) {
    const cookie = mfaCookie(data.data, secureCookies());
    store.set(cookie.name, cookie.value, cookie.options);
    return { step: "mfa" };
  }
  if (data && "access_token" in data.data) {
    for (const cookie of tokenCookies(data.data, secureCookies())) {
      store.set(cookie.name, cookie.value, cookie.options);
    }
    redirect(safeNext(input.data.next));
  }
  const failure = toApiError(response, error);
  return {
    step: "password",
    error: failure.problem.detail,
    code: failure.code,
    email: input.data.email,
  };
}

async function callLogin(email: string, password: string) {
  const client = await anonymousClient();
  return client.POST("/api/v1/auth/login", { body: { email, password } });
}

/** Bước 2: mã của ứng dụng xác thực hoặc mã khôi phục. */
async function verifyCode(_state: LoginState, formData: FormData): Promise<LoginState> {
  const t = await getTranslations("login");
  const store = await cookies();
  const mfaToken = store.get(MFA_COOKIE)?.value;
  if (!mfaToken) {
    return { step: "password", error: t("mfaExpired"), code: "auth.invalid_mfa_token" };
  }
  const input = CodeForm.safeParse(fields(formData));
  if (!input.success) {
    return { step: "mfa", error: t("invalidCode"), code: "validation_failed" };
  }
  let result: Awaited<ReturnType<typeof callMfa>>;
  try {
    result = await callMfa(mfaToken, input.data.code);
  } catch {
    return { step: "mfa", error: t("unreachable"), code: "core_unreachable" };
  }
  const { data, error, response } = result;
  if (data) {
    store.delete(MFA_COOKIE);
    for (const cookie of tokenCookies(data.data, secureCookies())) {
      store.set(cookie.name, cookie.value, cookie.options);
    }
    redirect(safeNext(input.data.next));
  }
  const failure = toApiError(response, error);
  // `mfa_token` hết hạn hay dùng hết lượt: quay lại bước mật khẩu.
  if (failure.code === "auth.invalid_mfa_token") {
    store.delete(MFA_COOKIE);
    return { step: "password", error: failure.problem.detail, code: failure.code };
  }
  return { step: "mfa", error: failure.problem.detail, code: failure.code };
}

async function callMfa(mfaToken: string, code: string) {
  const client = await anonymousClient();
  return client.POST("/api/v1/auth/login/mfa", { body: { mfa_token: mfaToken, code } });
}

/** Bỏ bước mã, đăng nhập bằng tài khoản khác. */
async function restart(): Promise<LoginState> {
  (await cookies()).delete(MFA_COOKIE);
  return { step: "password" };
}

/** Một action cho cả form: nút bấm gửi `intent` cho biết đang ở bước nào. */
export async function submitLogin(state: LoginState, formData: FormData): Promise<LoginState> {
  switch (formData.get("intent")) {
    case "code":
      return verifyCode(state, formData);
    case "restart":
      return restart();
    default:
      return signIn(state, formData);
  }
}
