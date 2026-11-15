// Đồ dùng chung của core giả: kiểu tài khoản và cách trả lời theo đúng hình dạng của core
// (envelope `{ data }`, lỗi Problem RFC 9457).
import type { IncomingMessage, ServerResponse } from "node:http";
import type { components } from "@autoxide/sdk";

export type Schemas = components["schemas"];

export type Account = {
  id: string;
  email: string;
  name: string;
  password: string;
  canReadModules: boolean;
  mfa: boolean;
  recoveryCodes: string[];
  totpPending: boolean;
  verified: boolean;
  passkeys: Schemas["PasskeyResponse"][];
  credentialIds: string[];
  deleted: boolean;
  /** Thời điểm bị khoá; `null` khi đang dùng. */
  disabledAt: string | null;
  roleIds: string[];
  hasPassword: boolean;
  /** Lần mở phiên gần nhất (đăng nhập, đổi mật khẩu); `null` khi chưa từng. */
  lastSignInAt: string | null;
  /** Email đang chờ xác minh sau khi xin đổi; `null` khi không có. */
  pendingEmail: Schemas["PendingEmail"] | null;
  createdAt: string;
  updatedAt: string;
};

export function send(response: ServerResponse, status: number, body?: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

export function empty(response: ServerResponse, status: 202 | 204) {
  response.writeHead(status);
  response.end();
}

export function problem(
  response: ServerResponse,
  status: number,
  code: string,
  detail: string,
  errors?: Schemas["ProblemField"][],
  reason?: string,
) {
  send(response, status, {
    type: "about:blank",
    title: "Error",
    status,
    code,
    detail,
    ...(errors ? { errors } : {}),
    ...(reason ? { reason } : {}),
  } satisfies Schemas["Problem"]);
}

/**
 * `reason` của token trong link bị từ chối, như core (D-264): `used` khi đã dùng, `expired` với token
 * mẫu có đuôi `-expired`, còn lại `unknown`.
 */
export function tokenReason(token: string, used: boolean): string {
  if (used) return "used";
  return token.endsWith("-expired") ? "expired" : "unknown";
}

export function wrongPassword(response: ServerResponse) {
  problem(response, 400, "auth.wrong_password", "The current password is incorrect.");
}

export function wrongCode(response: ServerResponse) {
  problem(response, 422, "validation_failed", "The request has invalid fields.", [
    { field: "code", code: "invalid", detail: "is not a current code from your app" },
  ]);
}

export async function json(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
  }
  return text ? JSON.parse(text) : {};
}

export function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}
