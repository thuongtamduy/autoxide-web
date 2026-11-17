"use server";

// Server Action của màn "Tài khoản của tôi". Mọi lời gọi core chạy ở máy chủ với token lấy từ
// cookie `httpOnly`; trình duyệt chỉ nhận kết quả đã lọc (không có token). Core kiểm mọi thứ
// (mật khẩu hiện tại, mã MFA, luật mật khẩu); ở đây chỉ kiểm ô bắt buộc để báo sớm và gom lỗi.
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { send } from "@/lib/action";
import { proof } from "@/lib/confirm-server";
import { secureCookies } from "@/lib/env";
import { type FormState, nextDone, parseForm, problemState } from "@/lib/form";
import { type QrPath, qrPath } from "@/lib/qr";
import {
  PASSKEY_COOKIE,
  passkeyCookie,
  SESSION_COOKIE,
  SESSION_COOKIES,
  tokenCookies,
} from "@/lib/session";
import { getMe } from "@/lib/viewer";

const password = z.string().min(1);
const code = z.string().trim().min(1);

/** Câu "hãy điền ô này" theo từng ô. */
async function required(): Promise<{ fallback: string; messages: Record<string, string> }> {
  const t = await getTranslations("account.required");
  return {
    fallback: t("field"),
    messages: {
      current_password: t("current_password"),
      new_password: t("new_password"),
      new_email: t("new_email"),
      code: t("code"),
      name: t("name"),
      confirm_email: t("confirm_email"),
    },
  };
}

// ---------------------------------------------------------------- Mật khẩu và email

const PasswordForm = z.object({ current_password: password, new_password: password });

/** Đổi mật khẩu. Core kết thúc mọi phiên rồi trả token của phiên mới: đặt lại cookie. */
export async function changePassword(state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const input = parseForm(PasswordForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields };
  const result = await send((client) =>
    client.POST("/api/v1/auth/me/password", { body: input.data }),
  );
  if (!result.ok) {
    return problemState(result.problem, ["current_password", "new_password"], {
      "auth.wrong_password": "current_password",
    });
  }
  const store = await cookies();
  for (const cookie of tokenCookies(result.data.data, secureCookies())) {
    store.set(cookie.name, cookie.value, cookie.options);
  }
  refresh();
  return { done: nextDone(state) };
}

const EmailForm = z.object({ new_email: z.string().trim().min(1) });

/** Đổi email: core gửi thư xác minh tới địa chỉ mới; email chỉ đổi khi bấm link. */
export async function changeEmail(state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const typed = String(formData.get("new_email") ?? "");
  const input = parseForm(EmailForm, formData, fallback, messages);
  const confirmed = await proof(formData);
  if (!input.ok || !confirmed.ok) {
    return {
      ...(confirmed.ok ? {} : confirmed.state),
      fields: {
        ...(input.ok ? {} : input.fields),
        ...(confirmed.ok ? {} : confirmed.state.fields),
      },
      values: { new_email: typed },
    };
  }
  const result = await send((client) =>
    client.POST("/api/v1/auth/me/email", { body: { ...input.data, ...confirmed.body } }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["new_email", "current_password"], {
        "auth.wrong_password": "current_password",
        "auth.email_taken": "new_email",
        "auth.email_already_verified": "new_email",
      }),
      values: { new_email: typed },
    };
  }
  // Trang hiện email đang chờ xác minh (`pending_email` của `/me`), nên tải lại.
  refresh();
  return { done: nextDone(state), values: { new_email: input.data.new_email } };
}

/** Huỷ yêu cầu đổi email: link gửi tới địa chỉ mới ngừng dùng được, email giữ nguyên. */
export async function cancelEmailChange(state: FormState): Promise<FormState> {
  const result = await send((client) => client.DELETE("/api/v1/auth/me/email"));
  if (!result.ok) {
    const failed = problemState(result.problem, []);
    // Không còn yêu cầu nào (đã xác minh hay đã huỷ ở tab khác): tải lại để hiện đúng.
    if (failed.code === "auth.no_pending_email_change") refresh();
    return failed;
  }
  refresh();
  return { done: nextDone(state) };
}

/**
 * Tài khoản chưa có mật khẩu (vào bằng passkey) tự đặt mật khẩu đầu tiên: core không có endpoint
 * "đặt mật khẩu bằng phiên" (D-265 của core — kẻ lấy được token sẽ tạo được cách đăng nhập lâu dài),
 * mà gửi thư đặt lại mật khẩu tới chính email của tài khoản; nhận thư là bằng chứng chủ tài khoản.
 */
export async function sendPasswordLink(state: FormState): Promise<FormState> {
  const me = await getMe();
  const result = await send(
    (client) => client.POST("/api/v1/auth/password-reset", { body: { email: me.email } }),
    { guest: true },
  );
  if (!result.ok) return problemState(result.problem, []);
  return { done: nextDone(state), values: { email: me.email } };
}

/** Gửi lại thư xác minh email (core cho tối đa một thư mỗi phút). */
export async function resendVerification(state: FormState): Promise<FormState> {
  const result = await send((client) => client.POST("/api/v1/auth/me/email/verification"));
  if (!result.ok) {
    const failed = problemState(result.problem, []);
    // Đã xác minh rồi (vd ở tab khác): tải lại để hiện đúng trạng thái.
    if (failed.code === "auth.email_already_verified") refresh();
    return failed;
  }
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Xác thực hai bước

export interface TotpSetupState extends FormState {
  secret?: string;
  qr?: QrPath;
}

/** Bước 1 bật xác thực hai bước: mật khẩu → khoá bí mật để thêm vào app (QR hoặc gõ tay). */
export async function startTotp(
  state: TotpSetupState,
  formData: FormData,
): Promise<TotpSetupState> {
  const confirmed = await proof(formData);
  if (!confirmed.ok) return confirmed.state;
  const result = await send((client) =>
    client.POST("/api/v1/auth/me/mfa/totp", { body: confirmed.body }),
  );
  if (!result.ok) {
    return problemState(result.problem, ["current_password"], {
      "auth.wrong_password": "current_password",
    });
  }
  const setup = result.data.data;
  return { done: nextDone(state), secret: setup.secret, qr: qrPath(setup.otpauth_url) };
}

export interface CodesState extends FormState {
  /** Mã khôi phục mới; chỉ hiện một lần. */
  codes?: string[];
}

const CodeForm = z.object({ code });

/** Bước 2 bật xác thực hai bước: mã đầu tiên từ app → mười mã khôi phục. */
export async function confirmTotp(state: CodesState, formData: FormData): Promise<CodesState> {
  const { fallback, messages } = await required();
  const input = parseForm(CodeForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields };
  const result = await send((client) =>
    client.POST("/api/v1/auth/me/mfa/totp/confirm", { body: input.data }),
  );
  if (!result.ok) {
    return problemState(result.problem, ["code"], { "auth.invalid_mfa_code": "code" });
  }
  refresh();
  return { done: nextDone(state), codes: result.data.data.recovery_codes };
}

/** Tắt xác thực hai bước bằng mã của app hoặc một mã khôi phục. */
export async function disableTotp(state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const input = parseForm(CodeForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields };
  const result = await send((client) =>
    client.POST("/api/v1/auth/me/mfa/totp/disable", { body: input.data }),
  );
  if (!result.ok) {
    return problemState(result.problem, ["code"], { "auth.invalid_mfa_code": "code" });
  }
  refresh();
  return { done: nextDone(state) };
}

/** Thay mười mã khôi phục bằng mười mã mới (cần mã của app, không nhận mã khôi phục). */
export async function regenerateRecoveryCodes(
  state: CodesState,
  formData: FormData,
): Promise<CodesState> {
  const { fallback, messages } = await required();
  const input = parseForm(CodeForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields };
  const result = await send((client) =>
    client.POST("/api/v1/auth/me/mfa/recovery-codes", { body: input.data }),
  );
  if (!result.ok) {
    return problemState(result.problem, ["code"], { "auth.invalid_mfa_code": "code" });
  }
  refresh();
  return { done: nextDone(state), codes: result.data.data.recovery_codes };
}

// ---------------------------------------------------------------- Passkey

export interface PasskeyStartState extends FormState {
  /** Options WebAuthn cho `navigator.credentials.create()`. Không chứa secret. */
  options?: unknown;
}

const PasskeyForm = z.object({ name: z.string().trim().min(1).max(100) });

/**
 * Bước 1 thêm passkey: tên và mật khẩu → options cho trình duyệt. Id của nghi thức nằm trong
 * cookie `httpOnly` cho bước 2, không xuống trình duyệt.
 */
export async function startPasskey(formData: FormData): Promise<PasskeyStartState> {
  const { fallback, messages } = await required();
  const typed = String(formData.get("name") ?? "");
  const input = parseForm(PasskeyForm, formData, fallback, messages);
  const confirmed = await proof(formData);
  if (!input.ok || !confirmed.ok) {
    return {
      ...(confirmed.ok ? {} : confirmed.state),
      fields: {
        ...(input.ok ? {} : input.fields),
        ...(confirmed.ok ? {} : confirmed.state.fields),
      },
      values: { name: typed },
    };
  }
  const result = await send((client) =>
    client.POST("/api/v1/auth/me/passkeys/registration", { body: confirmed.body }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["current_password"], {
        "auth.wrong_password": "current_password",
      }),
      values: { name: typed },
    };
  }
  const cookie = passkeyCookie(result.data.data.ceremony_id, secureCookies());
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
  return { options: result.data.data.options, values: { name: input.data.name } };
}

/** Bước 2 thêm passkey: câu trả lời của authenticator (`credential.toJSON()`) → core kiểm. */
export async function finishPasskey(name: string, credential: unknown): Promise<FormState> {
  const t = await getTranslations("account.passkeys");
  const store = await cookies();
  const ceremonyId = store.get(PASSKEY_COOKIE)?.value;
  if (!ceremonyId) {
    return { error: t("expired"), code: "auth.invalid_passkey_ceremony" };
  }
  if (typeof credential !== "object" || credential === null) {
    return { error: t("failed"), code: "validation_failed" };
  }
  const result = await send((client) =>
    client.POST("/api/v1/auth/me/passkeys", {
      body: {
        ceremony_id: ceremonyId,
        name: name.trim(),
        credential: credential as Record<string, never>,
      },
    }),
  );
  store.delete(PASSKEY_COOKIE);
  if (!result.ok) {
    return problemState(result.problem, ["name"]);
  }
  refresh();
  return { done: 1 };
}

/** Gỡ một passkey; nó ngừng dùng được ngay. */
export async function removePasskey(state: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/me/passkeys/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) {
    if (result.problem.code === "auth.passkey_not_found") refresh();
    return problemState(result.problem, []);
  }
  refresh();
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Phiên đăng nhập

/** Đăng xuất một phiên khác (vd thiết bị bị mất). */
export async function endSession(state: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  // Phiên đang dùng thì đi qua nút "Đăng xuất" của menu tài khoản (xoá cả cookie).
  if (id === (await cookies()).get(SESSION_COOKIE)?.value) {
    const t = await getTranslations("account.sessions");
    return { error: t("useSignOut"), code: "account.current_session" };
  }
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/me/sessions/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) {
    if (result.problem.code === "auth.session_not_found") refresh();
    return problemState(result.problem, []);
  }
  refresh();
  return { done: nextDone(state) };
}

export interface EndedState extends FormState {
  ended?: number;
}

/** Đăng xuất mọi phiên khác, giữ phiên này. */
export async function endOtherSessions(state: EndedState): Promise<EndedState> {
  const current = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!current) {
    // Không biết phiên này là phiên nào thì không gửi: thiếu `keep`, core đăng xuất cả phiên này.
    const t = await getTranslations("account.sessions");
    return { error: t("unknownCurrent"), code: "account.unknown_session" };
  }
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/me/sessions", { params: { query: { keep: current } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state), ended: result.data.data.ended };
}

// ---------------------------------------------------------------- Xoá tài khoản

const DeleteForm = z.object({ confirm_email: z.string().trim().min(1) });

/** Xoá tài khoản: gõ lại email để xác nhận, rồi mật khẩu. Xong thì xoá cookie, về đăng nhập. */
export async function deleteAccount(_state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const typed = String(formData.get("confirm_email") ?? "");
  const input = parseForm(DeleteForm, formData, fallback, messages);
  const confirmed = await proof(formData);
  if (!input.ok || !confirmed.ok) {
    return {
      ...(confirmed.ok ? {} : confirmed.state),
      fields: {
        ...(input.ok ? {} : input.fields),
        ...(confirmed.ok ? {} : confirmed.state.fields),
      },
      values: { confirm_email: typed },
    };
  }
  const me = await getMe();
  if (input.data.confirm_email.toLowerCase() !== me.email.toLowerCase()) {
    const t = await getTranslations("account.delete");
    return {
      fields: { confirm_email: t("mismatch", { email: me.email }) },
      values: { confirm_email: typed },
    };
  }
  const result = await send((client) => client.DELETE("/api/v1/auth/me", { body: confirmed.body }));
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["current_password"], {
        "auth.wrong_password": "current_password",
      }),
      values: { confirm_email: typed },
    };
  }
  const store = await cookies();
  for (const name of SESSION_COOKIES) {
    store.delete(name);
  }
  redirect("/login?deleted=1");
}

/**
 * Nhận lời mời bằng tài khoản đang đăng nhập (`POST /auth/invitations/accept` kèm access token):
 * core cộng role của lời mời vào tài khoản này. Email của lời mời phải trùng email tài khoản
 * (`auth.invitation_email_mismatch`).
 */
export async function acceptInvitationAsMe(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const result = await send((client) =>
    client.POST("/api/v1/auth/invitations/accept", { body: { token } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/**
 * Sửa hồ sơ của chính mình (`PATCH /auth/me`): tên hiển thị, ngôn ngữ ưa thích (thư core gửi sau
 * này theo ngôn ngữ đó), múi giờ. Ô trống ở ngôn ngữ / múi giờ = bỏ ưa thích (`null`).
 */
export async function updateProfile(state: FormState, formData: FormData): Promise<FormState> {
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    locale: String(formData.get("locale") ?? ""),
    time_zone: String(formData.get("time_zone") ?? "").trim(),
  };
  if (!values.name) {
    const t = await getTranslations("access.required");
    return { fields: { name: t("name") }, values };
  }
  const result = await send((client) =>
    client.PATCH("/api/v1/auth/me", {
      body: {
        name: values.name,
        locale: values.locale || null,
        time_zone: values.time_zone || null,
      },
    }),
  );
  if (!result.ok) {
    return { ...problemState(result.problem, ["name", "locale", "time_zone"]), values };
  }
  refresh();
  return { done: nextDone(state) };
}
