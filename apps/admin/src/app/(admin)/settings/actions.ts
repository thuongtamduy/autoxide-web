"use server";

// Server Action của nhóm Cài đặt gọi core thật: webhook (`webhooks.manage`) và API key của người
// đang đăng nhập. Mọi lời gọi chạy ở máy chủ với token lấy từ cookie `httpOnly`. Core kiểm quyền và
// dữ liệu; ở đây chỉ kiểm ô bắt buộc để báo sớm và gom mọi lỗi một lần. Secret ký webhook và khoá
// API chỉ trả về trình duyệt một lần, đúng lúc core trả, để người dùng chép; không lưu ở đâu.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { send } from "@/lib/action";
import { expiresAt } from "@/lib/api-keys";
import { secureCookies } from "@/lib/env";
import { type FormState, nextDone, parseForm, problemState } from "@/lib/form";
import { PASSKEY_COOKIE, passkeyCookie } from "@/lib/session";

const WEBHOOKS = "/settings/webhooks";

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

function typed(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

/** Lỗi của phần tử mảng (`events[2]`, `permissions[0]`) gắn vào ô của cả mảng. */
function byArray(problem: Problem): Problem {
  if (!problem.errors) return problem;
  return {
    ...problem,
    errors: problem.errors.map((entry) => ({
      ...entry,
      field: entry.field.replace(/\[\d+\]$/, ""),
    })),
  };
}

async function required(): Promise<{ fallback: string; messages: Record<string, string> }> {
  const t = await getTranslations("settings.required");
  return {
    fallback: t("field"),
    messages: {
      url: t("url"),
      name: t("name"),
    },
  };
}

// ---------------------------------------------------------------- Webhook

/** Event đã chọn: ô "mọi event" thắng mọi ô khác (core nhận `["*"]`). */
function chosenEvents(formData: FormData): string[] {
  if (formData.get("all_events") === "on") return ["*"];
  return formData.getAll("event").map(String);
}

const EndpointForm = z.object({
  url: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export interface SecretState extends FormState {
  /** Secret ký (webhook) hay khoá (API key), chỉ có ngay sau khi tạo; core không cho xem lại. */
  secret?: string;
  /** Bản ghi vừa tạo. */
  id?: string;
}

/** Tạo endpoint; trả secret ký để hiện một lần. */
export async function createWebhook(state: SecretState, formData: FormData): Promise<SecretState> {
  const { fallback, messages } = await required();
  const values = typed(formData, ["url", "description"]);
  const input = parseForm(EndpointForm, formData, fallback, messages);
  const events = chosenEvents(formData);
  if (!input.ok || events.length === 0) {
    const t = await getTranslations("settings.required");
    return {
      fields: {
        ...(input.ok ? {} : input.fields),
        ...(events.length === 0 ? { events: t("events") } : {}),
      },
      values,
    };
  }
  const result = await send((client) =>
    client.POST("/api/v1/webhooks", {
      body: { url: input.data.url, description: input.data.description ?? "", events },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(byArray(result.problem), ["url", "description", "events"]),
      values,
    };
  }
  refresh();
  return { done: nextDone(state), secret: result.data.data.secret, id: result.data.data.id };
}

/** Sửa địa chỉ, mô tả, event. Gửi `If-Match` để không ghi đè thay đổi của người khác. */
export async function updateWebhook(state: FormState, formData: FormData): Promise<FormState> {
  const { fallback, messages } = await required();
  const values = typed(formData, ["url", "description"]);
  const input = parseForm(EndpointForm, formData, fallback, messages);
  const events = chosenEvents(formData);
  if (!input.ok || events.length === 0) {
    const t = await getTranslations("settings.required");
    return {
      fields: {
        ...(input.ok ? {} : input.fields),
        ...(events.length === 0 ? { events: t("events") } : {}),
      },
      values,
    };
  }
  const etag = String(formData.get("etag") ?? "");
  const result = await send((client) =>
    client.PATCH("/api/v1/webhooks/{id}", {
      params: { path: { id: idOf(formData) }, header: etag ? { "If-Match": etag } : {} },
      body: { url: input.data.url, description: input.data.description ?? "", events },
    }),
  );
  if (!result.ok) {
    return { ...problemState(byArray(result.problem), ["url", "description", "events"]), values };
  }
  refresh();
  return { done: nextDone(state) };
}

async function setDisabled(state: FormState, id: string, disabled: boolean): Promise<FormState> {
  const result = await send((client) =>
    client.PATCH("/api/v1/webhooks/{id}", { params: { path: { id } }, body: { disabled } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/** Tắt endpoint: ngừng gửi, bỏ các lần thử lại đang chờ. */
export async function disableWebhook(state: FormState, formData: FormData): Promise<FormState> {
  return setDisabled(state, idOf(formData), true);
}

/** Bật lại endpoint: event từ giờ được gửi tiếp. */
export async function enableWebhook(state: FormState, formData: FormData): Promise<FormState> {
  return setDisabled(state, idOf(formData), false);
}

/** Thay secret ký: secret cũ ngừng chạy ngay; secret mới hiện một lần. */
export async function rotateWebhookSecret(
  state: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const result = await send((client) =>
    client.POST("/api/v1/webhooks/{id}/secret", { params: { path: { id: idOf(formData) } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return { done: nextDone(state), secret: result.data.data.secret };
}

/** Xoá endpoint và lịch sử giao; về danh sách và báo đã xoá. */
export async function deleteWebhook(_state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/webhooks/{id}", { params: { path: { id: idOf(formData) } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  redirect(`${WEBHOOKS}?deleted=1`);
}

// ---------------------------------------------------------------- API key

const ApiKeyForm = z.object({
  name: z.string().trim().min(1),
  expiry: z.string().optional(),
});

/** Cách xác nhận lại khi tạo key (core nhận đúng một trong ba, D-272 của core). */
export type KeyConfirm = "password" | "totp" | "passkey";

export interface KeyPasskeyState extends FormState {
  /** Options WebAuthn cho `navigator.credentials.get()`. Không chứa secret. */
  options?: unknown;
}

/**
 * Xác nhận bằng passkey, bước 1: lấy nghi thức như khi đăng nhập bằng passkey
 * (`POST /auth/login/passkey/options`, cách core chọn thay vì một endpoint riêng). Id của nghi thức
 * nằm trong cookie `httpOnly` cho bước tạo key, không xuống trình duyệt.
 */
export async function startKeyPasskey(): Promise<KeyPasskeyState> {
  const result = await send((client) => client.POST("/api/v1/auth/login/passkey/options", {}), {
    guest: true,
  });
  if (!result.ok) return problemState(result.problem, []);
  const cookie = passkeyCookie(result.data.data.ceremony_id, secureCookies());
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
  return { options: result.data.data.options };
}

/** Phần xác nhận của thân request; `null` kèm lỗi ô khi thiếu. */
async function keyConfirmation(
  formData: FormData,
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; fields: Record<string, string>; error?: string; code?: string }
> {
  const t = await getTranslations("settings.required");
  const method = String(formData.get("confirm") ?? "password") as KeyConfirm;
  if (method === "totp") {
    const code = String(formData.get("totp_code") ?? "").trim();
    return code
      ? { ok: true, body: { totp_code: code } }
      : { ok: false, fields: { totp_code: t("code") } };
  }
  if (method === "passkey") {
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
      const p = await getTranslations("settings.apiKeys");
      return {
        ok: false,
        fields: {},
        error: p("passkeyExpired"),
        code: "auth.invalid_passkey_ceremony",
      };
    }
    return { ok: true, body: { passkey_ceremony_id: ceremony, passkey_credential: credential } };
  }
  const password = String(formData.get("current_password") ?? "");
  return password
    ? { ok: true, body: { current_password: password } }
    : { ok: false, fields: { current_password: t("password") } };
}

/**
 * Tạo API key cho chính mình: tên, permission (chỉ những gì mình có), hạn, và xác nhận lại là chính
 * mình — mật khẩu, mã của app xác thực hay một passkey (core đòi, để token bị lộ không tự tạo được
 * key sống lâu hơn nó). Trả khoá để hiện một lần.
 */
export async function createApiKey(state: SecretState, formData: FormData): Promise<SecretState> {
  const { fallback, messages } = await required();
  const values = typed(formData, ["name", "expiry", "confirm"]);
  const input = parseForm(ApiKeyForm, formData, fallback, messages);
  const permissions = formData.getAll("permission").map(String);
  const confirm = await keyConfirmation(formData);
  if (!input.ok || permissions.length === 0 || !confirm.ok) {
    const t = await getTranslations("settings.required");
    const fields = {
      ...(input.ok ? {} : input.fields),
      ...(permissions.length === 0 ? { permissions: t("permissions") } : {}),
      ...(confirm.ok ? {} : confirm.fields),
    };
    return {
      ...(Object.keys(fields).length > 0 ? { fields } : {}),
      ...(!confirm.ok && confirm.error ? { error: confirm.error, code: confirm.code } : {}),
      values,
    };
  }
  const expires = expiresAt(input.data.expiry ?? "never");
  const result = await send(
    (client) =>
      client.POST("/api/v1/auth/api-keys", {
        body: {
          name: input.data.name,
          permissions,
          ...confirm.body,
          ...(expires ? { expires_at: expires } : {}),
        },
      }),
    { own401: ["auth.passkey_sign_in_failed"] },
  );
  if (!result.ok) {
    return {
      ...problemState(
        byArray(result.problem),
        ["name", "permissions", "current_password", "totp_code"],
        { "auth.wrong_password": "current_password", "auth.mfa_not_enabled": "totp_code" },
      ),
      values,
    };
  }
  refresh();
  return { done: nextDone(state), secret: result.data.data.key, id: result.data.data.id };
}

/**
 * Quản trị viên thu hồi key của bất kỳ ai (`auth.api_keys.manage`): request dùng nó nhận 401 ngay;
 * nhật ký audit ghi người thu hồi.
 */
export async function revokeAnyApiKey(state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/all-api-keys/{id}", { params: { path: { id: idOf(formData) } } }),
  );
  if (!result.ok) {
    if (result.problem.code === "auth.api_key_not_found") refresh();
    return problemState(result.problem, []);
  }
  refresh();
  return { done: nextDone(state) };
}

/** Thu hồi một API key: request dùng nó nhận 401 ngay. */
export async function revokeApiKey(state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/api-keys/{id}", { params: { path: { id: idOf(formData) } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Cài đặt theo khách

/**
 * Đặt một cài đặt theo khách. Không có `tenant_id`: khách của người đăng nhập
 * (`PUT /kernel/settings/{name}`, `kernel.settings.manage`). Có `tenant_id`: nhân sự nền tảng đặt cho
 * khách đó (`PUT /kernel/tenants/{id}/settings/{name}`, `kernel.tenants.manage`, D-296 của core).
 * Giá trị bí mật được core mã hoá khi lưu và không bao giờ trả lại; ở đây không giữ lại giá trị đã
 * gõ. Core kiểm giá trị (422, lỗi ở ô `value`); khách đang dời thì 409 `tenant_moving`.
 */
export async function setTenantSetting(state: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "");
  const tenant = String(formData.get("tenant_id") ?? "");
  const secret = formData.get("secret") === "1";
  const value = String(formData.get("value") ?? "");
  if (!value.trim()) {
    const t = await getTranslations("settings.required");
    return { fields: { value: t("value") } };
  }
  const body = { value: secret ? value : value.trim() };
  const result = await send((client) =>
    tenant
      ? client.PUT("/api/v1/kernel/tenants/{id}/settings/{name}", {
          params: { path: { id: tenant, name } },
          body,
        })
      : client.PUT("/api/v1/kernel/settings/{name}", { params: { path: { name } }, body }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["value"], { tenant_setting_unknown: "value" }),
      ...(secret ? {} : { values: { value } }),
    };
  }
  refresh();
  return { done: nextDone(state) };
}

/**
 * Bỏ cài đặt theo khách (`id` là tên cài đặt; `tenant_id` như `setTenantSetting`): cấu hình chung
 * của máy chủ áp dụng lại.
 */
export async function removeTenantSetting(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = idOf(formData);
  const tenant = String(formData.get("tenant_id") ?? "");
  const result = await send((client) =>
    tenant
      ? client.DELETE("/api/v1/kernel/tenants/{id}/settings/{name}", {
          params: { path: { id: tenant, name } },
        })
      : client.DELETE("/api/v1/kernel/settings/{name}", { params: { path: { name } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}
