"use server";

import { toApiError } from "@autoxide/sdk";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { anonymousClient } from "@/lib/core";
import { adminTenantSetting, secureCookies } from "@/lib/env";
import {
  MFA_COOKIE,
  mfaCookie,
  PASSKEY_COOKIE,
  passkeyCookie,
  safeNext,
  tokenCookies,
} from "@/lib/session";
import { asksForWorkspace, normalizeWorkspace, TENANT_COOKIE } from "@/lib/tenant";
import { applyThemeCookie, savedTheme } from "@/lib/theme-sync";

/** Trạng thái form đăng nhập, giữ giữa các lần gửi. */
export type LoginState = {
  step: "password" | "mfa";
  /** Câu báo lỗi cho người dùng (đã theo ngôn ngữ). */
  error?: string;
  /** `code` lỗi của core, để test và giao diện rẽ nhánh. */
  code?: string;
  /** Email vừa gửi, điền lại vào form sau khi báo lỗi (React đặt lại form sau mỗi lần gửi). */
  email?: string;
  /**
   * Hiện ô "Không gian làm việc" (khách của core). Chỉ khi core chạy nhiều khách mà chưa biết
   * người dùng thuộc khách nào (`tenant_required`, `tenant_not_found`).
   */
  askWorkspace?: boolean;
  /** Khách vừa gõ, điền lại vào ô. */
  workspace?: string;
};

const PasswordForm = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
  workspace: z.string().max(200).optional(),
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
  // Khách gõ ở ô "Không gian làm việc": nhớ trong cookie (không phải secret) để `anonymousClient`
  // gửi kèm lời gọi đăng nhập này, bước mã và lần đăng nhập sau. Để trống thì quên khách cũ.
  const typed = input.data.workspace;
  if (typed !== undefined) {
    const workspace = normalizeWorkspace(typed);
    if (workspace === null) {
      return {
        step: "password",
        error: t("invalidWorkspace"),
        code: "validation_failed",
        email: input.data.email,
        askWorkspace: true,
        workspace: typed,
      };
    }
    if (workspace) {
      store.set(TENANT_COOKIE, workspace, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies(),
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    } else {
      store.delete(TENANT_COOKIE);
    }
  }
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
    await restoreTheme(store, data.data.access_token);
    redirect(safeNext(input.data.next));
  }
  const failure = toApiError(response, error);
  const askWorkspace =
    (typed !== undefined || asksForWorkspace(failure.code)) && !adminTenantSetting();
  return {
    step: "password",
    error: asksForWorkspace(failure.code) && !typed ? t("workspaceNeeded") : failure.problem.detail,
    code: failure.code,
    email: input.data.email,
    ...(askWorkspace ? { askWorkspace, workspace: typed ?? "" } : {}),
  };
}

/** Giao diện sáng / tối đã chọn ở máy khác (cờ `ui.theme` của core) áp cho máy này khi đăng nhập. */
async function restoreTheme(
  store: Awaited<ReturnType<typeof cookies>>,
  accessToken: string,
): Promise<void> {
  const theme = await savedTheme(accessToken);
  if (theme) applyThemeCookie(store, theme);
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
    await restoreTheme(store, data.data.access_token);
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

/** Bước 1 đăng nhập bằng passkey: kết quả cho trình duyệt (options, hay lỗi để hiện). */
export type PasskeyLoginStart = {
  options?: unknown;
  error?: string;
  code?: string;
  /** Core nhiều khách chưa biết khách: hiện ô "Không gian làm việc" như đăng nhập bằng mật khẩu. */
  askWorkspace?: boolean;
};

/**
 * Bước 1 đăng nhập bằng passkey (`POST /auth/login/passkey/options`): không cần email — passkey tự
 * nhận ra tài khoản. Id nghi thức nằm trong cookie `httpOnly` cho bước 2, không xuống trình duyệt.
 * `workspace`: ô "Không gian làm việc" nếu đang hiện (nhớ như khi đăng nhập bằng mật khẩu).
 */
export async function startPasskeyLogin(workspace: string | null): Promise<PasskeyLoginStart> {
  const t = await getTranslations("login");
  const store = await cookies();
  if (workspace !== null) {
    const normalized = normalizeWorkspace(workspace);
    if (normalized === null) {
      return { error: t("invalidWorkspace"), code: "validation_failed", askWorkspace: true };
    }
    if (normalized) {
      store.set(TENANT_COOKIE, normalized, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies(),
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    } else {
      store.delete(TENANT_COOKIE);
    }
  }
  let result: Awaited<ReturnType<typeof callPasskeyOptions>>;
  try {
    result = await callPasskeyOptions();
  } catch {
    return { error: t("unreachable"), code: "core_unreachable" };
  }
  const { data, error, response } = result;
  if (data) {
    const cookie = passkeyCookie(data.data.ceremony_id, secureCookies());
    store.set(cookie.name, cookie.value, cookie.options);
    return { options: data.data.options };
  }
  const failure = toApiError(response, error);
  if (asksForWorkspace(failure.code) && !adminTenantSetting()) {
    return {
      error: workspace ? failure.problem.detail : t("workspaceNeeded"),
      code: failure.code,
      askWorkspace: true,
    };
  }
  return { error: failure.problem.detail, code: failure.code };
}

async function callPasskeyOptions() {
  const client = await anonymousClient();
  return client.POST("/api/v1/auth/login/passkey/options");
}

/**
 * Bước 2: câu trả lời của authenticator (`credential.toJSON()`) → core kiểm và cấp token (cookie
 * `httpOnly` như đăng nhập bằng mật khẩu), rồi chuyển tới `next`. Lỗi thì trả câu để hiện.
 */
export async function finishPasskeyLogin(
  credential: unknown,
  next: string,
): Promise<{ error: string; code: string }> {
  const t = await getTranslations("login");
  const store = await cookies();
  const ceremonyId = store.get(PASSKEY_COOKIE)?.value;
  if (!ceremonyId) {
    return { error: t("passkeyExpired"), code: "auth.invalid_passkey_ceremony" };
  }
  if (typeof credential !== "object" || credential === null) {
    return { error: t("passkeyFailed"), code: "validation_failed" };
  }
  let result: Awaited<ReturnType<typeof callPasskeyLogin>>;
  try {
    result = await callPasskeyLogin(ceremonyId, credential as Record<string, never>);
  } catch {
    return { error: t("unreachable"), code: "core_unreachable" };
  }
  store.delete(PASSKEY_COOKIE);
  const { data, error, response } = result;
  if (data) {
    for (const cookie of tokenCookies(data.data, secureCookies())) {
      store.set(cookie.name, cookie.value, cookie.options);
    }
    await restoreTheme(store, data.data.access_token);
    redirect(safeNext(next));
  }
  const failure = toApiError(response, error);
  return { error: failure.problem.detail, code: failure.code };
}

async function callPasskeyLogin(ceremonyId: string, credential: Record<string, never>) {
  const client = await anonymousClient();
  return client.POST("/api/v1/auth/login/passkey", {
    body: { ceremony_id: ceremonyId, credential },
  });
}
