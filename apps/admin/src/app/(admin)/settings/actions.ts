"use server";

// Server Action của nhóm Cài đặt gọi core thật: webhook (`webhooks.manage`) và API key của người
// đang đăng nhập. Mọi lời gọi chạy ở máy chủ với token lấy từ cookie `httpOnly`. Core kiểm quyền và
// dữ liệu; ở đây chỉ kiểm ô bắt buộc để báo sớm và gom mọi lỗi một lần. Secret ký webhook và khoá
// API chỉ trả về trình duyệt một lần, đúng lúc core trả, để người dùng chép; không lưu ở đâu.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { send } from "@/lib/action";
import { expiresAt } from "@/lib/api-keys";
import { type FormState, nextDone, parseForm, problemState } from "@/lib/form";

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
      current_password: t("password"),
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
  current_password: z.string().min(1),
  expiry: z.string().optional(),
});

/**
 * Tạo API key cho chính mình: tên, permission (chỉ những gì mình có), hạn, mật khẩu hiện tại
 * (core đòi, để token bị lộ không tự tạo được key sống lâu hơn nó). Trả khoá để hiện một lần.
 */
export async function createApiKey(state: SecretState, formData: FormData): Promise<SecretState> {
  const { fallback, messages } = await required();
  const values = typed(formData, ["name", "expiry"]);
  const input = parseForm(ApiKeyForm, formData, fallback, messages);
  const permissions = formData.getAll("permission").map(String);
  if (!input.ok || permissions.length === 0) {
    const t = await getTranslations("settings.required");
    return {
      fields: {
        ...(input.ok ? {} : input.fields),
        ...(permissions.length === 0 ? { permissions: t("permissions") } : {}),
      },
      values,
    };
  }
  const expires = expiresAt(input.data.expiry ?? "never");
  const result = await send((client) =>
    client.POST("/api/v1/auth/api-keys", {
      body: {
        name: input.data.name,
        permissions,
        current_password: input.data.current_password,
        ...(expires ? { expires_at: expires } : {}),
      },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(byArray(result.problem), ["name", "permissions", "current_password"], {
        "auth.wrong_password": "current_password",
      }),
      values,
    };
  }
  refresh();
  return { done: nextDone(state), secret: result.data.data.key, id: result.data.data.id };
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
